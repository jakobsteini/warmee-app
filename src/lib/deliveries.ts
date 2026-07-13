import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type {
  Delivery,
  DeliveryItemWithProduct,
  DeliveryListRow,
  DeliveryStatus,
} from '../types/delivery'

/**
 * Alle Lieferungen der eigenen Org (RLS scoped automatisch), neueste zuerst.
 * Händlername, Saison-Label (über die Produktionsbestellung) und die
 * Positions-Stückzahlen werden mitgeladen, damit die Übersicht Summen ohne
 * Nachladen zeigen kann.
 */
export async function listDeliveries(): Promise<DeliveryListRow[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(
      'id, org_id, production_order_id, dealer_id, status, notes, created_at, updated_at, dealer:dealers(name), production_order:production_orders(season_id, season:seasons(label)), delivery_items(quantity)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as DeliveryListRow[]
}

/** Produktionsbestellung, die zu einer Lieferung gehört (mit Saison). */
export interface DeliveryProductionOrder {
  id: string
  season_id: string
  season: { label: string } | null
}

/** Eine einzelne Lieferung inkl. Produktionsbestellung, Saison und Händlername. */
export interface DeliveryDetail extends Delivery {
  dealer: { name: string } | null
  production_order: DeliveryProductionOrder | null
}

/** Eine einzelne Lieferung laden (mit Händler + Produktionsbestellung/Saison). */
export async function getDelivery(id: string): Promise<DeliveryDetail> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(
      '*, dealer:dealers(name), production_order:production_orders(id, season_id, season:seasons(label))',
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as DeliveryDetail
}

/** Alle Positionen einer Lieferung inkl. Produktname, in Anlage-Reihenfolge. */
export async function listDeliveryItems(
  deliveryId: string,
): Promise<DeliveryItemWithProduct[]> {
  const { data, error } = await supabase
    .from('delivery_items')
    .select('*, product:products(name)')
    .eq('delivery_id', deliveryId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as DeliveryItemWithProduct[]
}

/** Produktionsbestellung mit Status „received" für die Verteilungs-Auswahl. */
export interface ReceivedProductionOrder {
  id: string
  season_id: string
  generated_at: string | null
  season: { label: string } | null
}

/**
 * Alle Produktionsbestellungen mit Status „received" (Ware angekommen), neueste
 * zuerst. Basis für „Verteilung generieren".
 */
export async function listReceivedProductionOrders(): Promise<
  ReceivedProductionOrder[]
> {
  const { data, error } = await supabase
    .from('production_orders')
    .select('id, season_id, generated_at, season:seasons(label)')
    .eq('status', 'received')
    .order('generated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ReceivedProductionOrder[]
}

/** Rohzeile aus dem Order-Positions-Query (mit Händler der Order). */
interface RawDealerItem {
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  orders: { dealer_id: string } | null
}

/** Schlüssel für die Gruppierung nach Produkt + Farbe + Größe. */
export function itemKey(
  product_id: string,
  color: string | null,
  size: string | null,
): string {
  return `${product_id}||${color ?? ''}||${size ?? ''}`
}

/**
 * Verteilung für eine erhaltene Produktionsbestellung generieren.
 *
 * Legt je Händler, der in der Saison der Bestellung eine bestätigte Order hat,
 * eine Lieferung (Status = pending) an. Die Lieferpositionen werden aus den
 * originalen Order-Positionen des Händlers übernommen (nach Produkt + Farbe +
 * Größe zusammengefasst, Mengen summiert) — die Liefermenge startet also mit
 * der bestellten Menge und ist danach editierbar (Teillieferung).
 *
 * Wirft, wenn die Bestellung nicht „received" ist, bereits Lieferungen
 * existieren oder keine bestätigten Orders mit Positionen gefunden werden.
 */
export async function generateDeliveries(
  productionOrderId: string,
): Promise<number> {
  const org_id = await getMyOrgId()

  // Bestellung laden und Status prüfen.
  const { data: po, error: poError } = await supabase
    .from('production_orders')
    .select('id, season_id, status')
    .eq('id', productionOrderId)
    .single()

  if (poError) throw poError
  if (po.status !== 'received') {
    throw new Error(
      'Verteilung nur möglich, wenn die Produktionsbestellung den Status „Erhalten" hat.',
    )
  }

  // Doppelte Verteilung verhindern.
  const { count, error: countError } = await supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('production_order_id', productionOrderId)

  if (countError) throw countError
  if ((count ?? 0) > 0) {
    throw new Error(
      'Für diese Produktionsbestellung wurde bereits eine Verteilung erstellt.',
    )
  }

  // Alle Positionen bestätigter Orders dieser Saison inkl. Händler der Order.
  // Der !inner-Join filtert auf Order-Ebene (Saison + Status); RLS scoped auf
  // die eigene Org.
  const { data: rawItems, error: itemsError } = await supabase
    .from('order_items')
    .select(
      'product_id, color, size, quantity, orders!inner(dealer_id, season_id, status)',
    )
    .eq('orders.season_id', po.season_id)
    .eq('orders.status', 'confirmed')

  if (itemsError) throw itemsError

  const items = (rawItems ?? []) as unknown as RawDealerItem[]
  if (items.length === 0) {
    throw new Error(
      'Keine bestätigten Orders mit Artikeln in dieser Saison gefunden.',
    )
  }

  // Je Händler die Positionen nach Produkt + Farbe + Größe zusammenfassen.
  const byDealer = new Map<
    string,
    Map<
      string,
      { product_id: string; color: string | null; size: string | null; total: number }
    >
  >()
  for (const it of items) {
    const dealerId = it.orders?.dealer_id
    if (!dealerId) continue
    const color = it.color ?? null
    const size = it.size ?? null
    const key = itemKey(it.product_id, color, size)
    let group = byDealer.get(dealerId)
    if (!group) {
      group = new Map()
      byDealer.set(dealerId, group)
    }
    const existing = group.get(key)
    if (existing) {
      existing.total += it.quantity ?? 0
    } else {
      group.set(key, { product_id: it.product_id, color, size, total: it.quantity ?? 0 })
    }
  }

  // Je Händler eine Lieferung samt Positionen anlegen.
  const createdDeliveries: string[] = []
  try {
    for (const [dealerId, group] of byDealer) {
      const { data: delivery, error: delError } = await supabase
        .from('deliveries')
        .insert({
          org_id,
          production_order_id: productionOrderId,
          dealer_id: dealerId,
        })
        .select('id')
        .single()

      if (delError) throw delError
      createdDeliveries.push(delivery.id)

      const rows = [...group.values()].map((g) => ({
        delivery_id: delivery.id,
        product_id: g.product_id,
        color: g.color,
        size: g.size,
        quantity: g.total,
      }))

      const { error: insErr } = await supabase.from('delivery_items').insert(rows)
      if (insErr) throw insErr
    }
  } catch (err) {
    // Teilweise angelegte Verteilung wieder entfernen, damit kein
    // inkonsistenter Zustand zurückbleibt (delivery_items per Cascade).
    if (createdDeliveries.length > 0) {
      await supabase.from('deliveries').delete().in('id', createdDeliveries)
    }
    throw err
  }

  return createdDeliveries.length
}

/**
 * Bestellte Mengen (aus den originalen bestätigten Orders des Händlers in der
 * Saison) als Map nach Produkt + Farbe + Größe. Basis für den Soll/Ist-Abgleich
 * gegen die Liefermengen.
 */
export async function orderedQuantities(
  seasonId: string,
  dealerId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('order_items')
    .select('product_id, color, size, quantity, orders!inner(dealer_id, season_id, status)')
    .eq('orders.season_id', seasonId)
    .eq('orders.dealer_id', dealerId)
    .eq('orders.status', 'confirmed')

  if (error) throw error

  const map = new Map<string, number>()
  for (const it of (data ?? []) as unknown as RawDealerItem[]) {
    const key = itemKey(it.product_id, it.color ?? null, it.size ?? null)
    map.set(key, (map.get(key) ?? 0) + (it.quantity ?? 0))
  }
  return map
}

/** Liefermenge einer Position setzen (Teillieferung). */
export async function updateDeliveryItemQuantity(
  itemId: string,
  quantity: number,
): Promise<void> {
  const { error } = await supabase
    .from('delivery_items')
    .update({ quantity })
    .eq('id', itemId)
  if (error) throw error
}

/** Status einer Lieferung ändern (Ausstehend → Verpackt → Versendet → Geliefert). */
export async function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
): Promise<Delivery> {
  const { data, error } = await supabase
    .from('deliveries')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Delivery
}

/** Notiz einer Lieferung aktualisieren. */
export async function updateDeliveryNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('deliveries')
    .update({ notes })
    .eq('id', id)
  if (error) throw error
}

/** Lieferung löschen (delivery_items per ON DELETE CASCADE mit). */
export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from('deliveries').delete().eq('id', id)
  if (error) throw error
}
