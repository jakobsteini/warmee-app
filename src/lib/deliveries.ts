import { supabase } from './supabase'
import { getMyOrgId } from './org'
import { itemKey } from './itemKey'
import { hasGoodsReceipts, receivedByKey } from './goodsReceipts'
import type {
  Delivery,
  DeliveryItemWithProduct,
  DeliveryListRow,
  DeliveryStatus,
} from '../types/delivery'
import type { DistributionShortfall } from '../types/goodsReceipt'

// itemKey lebt neutral in ./itemKey (kein Zyklus mit goodsReceipts), wird hier
// aber weiter re-exportiert, weil bestehende Importe darauf zeigen.
export { itemKey }

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

/**
 * Ergebnis von `generateDeliveries`: Anzahl angelegter Lieferungen plus die
 * Fehlmengen (Positionen, bei denen mehr verteilt werden soll als real
 * eingegangen ist). `shortfalls` ist leer, wenn kein Wareneingang erfasst ist
 * oder der Eingang für alle Positionen ausreicht.
 */
export interface GenerateDeliveriesResult {
  created: number
  shortfalls: DistributionShortfall[]
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
): Promise<GenerateDeliveriesResult> {
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

  // Fehlmengen ermitteln (weicher Hinweis, kein Block): Ist ein Wareneingang
  // erfasst und übersteigt die verteilte Summe je Position den Eingang, wird die
  // Lücke beziffert zurückgegeben. Die Auflösung (wer bekommt weniger) ist die
  // noch nicht gebaute prioritätsbasierte Zuteilung — hier nur sichtbar machen.
  const shortfalls = await computeShortfalls(productionOrderId, byDealer)

  return { created: createdDeliveries.length, shortfalls }
}

/**
 * Fehlmengen je Position: verteilte Gesamtmenge (über alle Händler) gegen den
 * erfassten Wareneingang. Leer, wenn kein Wareneingang erfasst ist.
 */
async function computeShortfalls(
  productionOrderId: string,
  byDealer: Map<
    string,
    Map<
      string,
      { product_id: string; color: string | null; size: string | null; total: number }
    >
  >,
): Promise<DistributionShortfall[]> {
  if (!(await hasGoodsReceipts(productionOrderId))) return []

  // Verteilte Gesamtmenge je Schlüssel über alle Händler summieren.
  const distributedByKey = new Map<
    string,
    { product_id: string; color: string | null; size: string | null; total: number }
  >()
  for (const group of byDealer.values()) {
    for (const [key, g] of group) {
      const acc = distributedByKey.get(key)
      if (acc) acc.total += g.total
      else distributedByKey.set(key, { ...g })
    }
  }

  const received = await receivedByKey(productionOrderId)

  // Produktnamen für die betroffenen Positionen nachladen (eine Abfrage).
  const productIds = [...distributedByKey.values()].map((g) => g.product_id)
  const nameById = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds)
    if (error) throw error
    for (const p of (prods ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name)
    }
  }

  const shortfalls: DistributionShortfall[] = []
  for (const [key, g] of distributedByKey) {
    const recv = received.get(key) ?? 0
    const gap = g.total - recv
    if (gap > 0) {
      shortfalls.push({
        productName: nameById.get(g.product_id) ?? '—',
        color: g.color,
        size: g.size,
        ordered: g.total,
        received: recv,
        gap,
      })
    }
  }
  return shortfalls
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

/**
 * Liefermenge einer Position setzen (Teillieferung).
 *
 * Mengenkontrolle: Ist für die Produktionsbestellung ein Wareneingang erfasst,
 * darf die über ALLE Lieferungen verteilte Menge dieser Position den erfassten
 * Eingang nicht übersteigen. Bei Überschreitung wird mit bezifferter Meldung
 * geworfen — keine stille Falschmenge. Ohne erfassten Wareneingang gilt (wie
 * bisher) keine Obergrenze.
 */
export async function updateDeliveryItemQuantity(
  itemId: string,
  quantity: number,
): Promise<void> {
  await assertWithinReceived(itemId, quantity)

  const { error } = await supabase
    .from('delivery_items')
    .update({ quantity })
    .eq('id', itemId)
  if (error) throw error
}

/** Positions-Zeile einer Lieferung mit Produktionsbestellung + Produktname. */
interface DeliveryItemContext {
  product_id: string
  color: string | null
  size: string | null
  product: { name: string } | null
  deliveries: { production_order_id: string } | null
}

/**
 * Wirft, wenn `quantity` für diese Position die verfügbare Restmenge des
 * erfassten Wareneingangs übersteigt (Summe über alle Lieferungen der
 * Produktionsbestellung, ohne die eigene Zeile). No-op ohne Wareneingang.
 */
async function assertWithinReceived(
  itemId: string,
  quantity: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('delivery_items')
    .select(
      'product_id, color, size, product:products(name), deliveries!inner(production_order_id)',
    )
    .eq('id', itemId)
    .single()
  if (error) throw error

  const ctx = data as unknown as DeliveryItemContext
  const productionOrderId = ctx.deliveries?.production_order_id
  if (!productionOrderId) return
  if (!(await hasGoodsReceipts(productionOrderId))) return

  const key = itemKey(ctx.product_id, ctx.color, ctx.size)
  const received = (await receivedByKey(productionOrderId)).get(key) ?? 0

  // Bereits anderweitig verteilt (alle Lieferungen der PO, außer dieser Zeile).
  const { data: siblings, error: sibErr } = await supabase
    .from('delivery_items')
    .select('id, product_id, color, size, quantity, deliveries!inner(production_order_id)')
    .eq('deliveries.production_order_id', productionOrderId)
  if (sibErr) throw sibErr

  let others = 0
  for (const s of (siblings ?? []) as unknown as {
    id: string
    product_id: string
    color: string | null
    size: string | null
    quantity: number | null
  }[]) {
    if (s.id === itemId) continue
    if (itemKey(s.product_id, s.color, s.size) === key) others += s.quantity ?? 0
  }

  const remaining = received - others
  if (quantity > remaining) {
    const label = [ctx.product?.name ?? '—', ctx.color, ctx.size]
      .filter(Boolean)
      .join(' · ')
    throw new Error(
      `${label}: nur ${received} Stück eingegangen, ${others} bereits anderweitig verteilt — höchstens ${Math.max(remaining, 0)} möglich.`,
    )
  }
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
