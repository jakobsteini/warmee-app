import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type {
  ProductionOrder,
  ProductionOrderItemWithProduct,
  ProductionOrderListRow,
  ProductionStatus,
} from '../types/productionOrder'

/**
 * Alle Nepal-Bestellungen der eigenen Org (RLS scoped automatisch),
 * neueste zuerst. Saison-Label und die Positions-Stückzahlen werden mitgeladen,
 * damit die Übersicht die Gesamtstückzahl ohne Nachladen zeigen kann.
 */
export async function listProductionOrders(): Promise<ProductionOrderListRow[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(
      'id, org_id, season_id, status, generated_at, sent_at, notes, created_by, created_at, season:seasons(label), production_order_items(total_quantity)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ProductionOrderListRow[]
}

/** Eine einzelne Nepal-Bestellung laden. */
export async function getProductionOrder(id: string): Promise<ProductionOrder> {
  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as ProductionOrder
}

/**
 * Alle Positionen einer Nepal-Bestellung inkl. Produktname, sortiert nach
 * Produkt, Farbe, Größe.
 */
export async function listProductionOrderItems(
  productionOrderId: string,
): Promise<ProductionOrderItemWithProduct[]> {
  const { data, error } = await supabase
    .from('production_order_items')
    .select('*, product:products(name)')
    .eq('production_order_id', productionOrderId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as ProductionOrderItemWithProduct[]
}

/** Eine Zeile aus dem aggregierten Rohdaten-Query. */
interface RawOrderItem {
  product_id: string
  color: string | null
  size: string | null
  quantity: number
}

/**
 * Neue Nepal-Bestellung aus allen bestätigten Orders einer Saison generieren.
 *
 * Aggregiert alle order_items der bestätigten (status = 'confirmed') Orders der
 * Saison nach Produkt + Farbe + Größe und summiert die Stückzahlen. Legt eine
 * production_orders-Zeile (Status = draft) samt aggregierten
 * production_order_items an und gibt die neue Bestellung zurück.
 *
 * Wirft, wenn keine bestätigten Orders mit Positionen existieren.
 */
export async function generateProductionOrder(
  seasonId: string,
): Promise<ProductionOrder> {
  const [org_id, created_by] = await Promise.all([
    getMyOrgId(),
    getMyUserId(),
  ])

  // Alle Positionen bestätigter Orders dieser Saison laden. Der !inner-Join
  // filtert auf die Order-Ebene (Saison + Status); RLS scoped bereits auf die
  // eigene Org.
  const { data: rawItems, error: itemsError } = await supabase
    .from('order_items')
    .select('product_id, color, size, quantity, orders!inner(season_id, status)')
    .eq('orders.season_id', seasonId)
    .eq('orders.status', 'confirmed')

  if (itemsError) throw itemsError

  const items = (rawItems ?? []) as unknown as RawOrderItem[]
  if (items.length === 0) {
    throw new Error(
      'Keine bestätigten Orders mit Artikeln in dieser Saison gefunden.',
    )
  }

  // Nach Produkt + Farbe + Größe gruppieren und Stückzahlen summieren.
  const groups = new Map<
    string,
    { product_id: string; color: string | null; size: string | null; total: number }
  >()
  for (const it of items) {
    const color = it.color ?? null
    const size = it.size ?? null
    const key = `${it.product_id}||${color ?? ''}||${size ?? ''}`
    const existing = groups.get(key)
    if (existing) {
      existing.total += it.quantity ?? 0
    } else {
      groups.set(key, {
        product_id: it.product_id,
        color,
        size,
        total: it.quantity ?? 0,
      })
    }
  }

  // Kopf-Datensatz anlegen (Status = draft).
  const { data: order, error: orderError } = await supabase
    .from('production_orders')
    .insert({ org_id, season_id: seasonId, created_by })
    .select()
    .single()

  if (orderError) throw orderError

  // Aggregierte Positionen anlegen.
  const rows = [...groups.values()].map((g) => ({
    production_order_id: order.id,
    product_id: g.product_id,
    color: g.color,
    size: g.size,
    total_quantity: g.total,
  }))

  const { error: insertError } = await supabase
    .from('production_order_items')
    .insert(rows)

  if (insertError) {
    // Kopf ohne Positionen ist wertlos — wieder entfernen, damit kein
    // verwaister Entwurf zurückbleibt.
    await supabase.from('production_orders').delete().eq('id', order.id)
    throw insertError
  }

  return order as ProductionOrder
}

/**
 * Status einer Nepal-Bestellung ändern. Beim Übergang auf „Gesendet" wird
 * sent_at gesetzt, sofern noch nicht vorhanden.
 */
export async function updateProductionStatus(
  id: string,
  status: ProductionStatus,
): Promise<ProductionOrder> {
  const patch: { status: ProductionStatus; sent_at?: string } = { status }
  if (status === 'sent') {
    patch.sent_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('production_orders')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ProductionOrder
}

/** Notiz einer Nepal-Bestellung aktualisieren. */
export async function updateProductionNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('production_orders')
    .update({ notes })
    .eq('id', id)
  if (error) throw error
}

/** Nepal-Bestellung löschen (Positionen per ON DELETE CASCADE mit). */
export async function deleteProductionOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('production_orders')
    .delete()
    .eq('id', id)
  if (error) throw error
}
