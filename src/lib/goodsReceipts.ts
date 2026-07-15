import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { itemKey } from './itemKey'
import type {
  GoodsReceipt,
  GoodsReceiptWithItems,
  ReceiptItemInput,
  ReconciliationRow,
} from '../types/goodsReceipt'

/**
 * Alle Wareneingänge einer Produktionsbestellung inkl. Positionen, neueste
 * zuerst. RLS scoped über den Kopf auf die eigene Org.
 */
export async function listGoodsReceipts(
  productionOrderId: string,
): Promise<GoodsReceiptWithItems[]> {
  const { data, error } = await supabase
    .from('goods_receipts')
    .select('*, goods_receipt_items(*)')
    .eq('production_order_id', productionOrderId)
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as GoodsReceiptWithItems[]
}

/** Ob für die Produktionsbestellung überhaupt ein Wareneingang erfasst ist. */
export async function hasGoodsReceipts(
  productionOrderId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('goods_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('production_order_id', productionOrderId)

  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * Real eingegangene Mengen je Positions-Schlüssel (Produkt/Farbe/Größe), summiert
 * über ALLE Wareneingänge der Produktionsbestellung. Grundlage für die
 * Mengenkontrolle der Verteilung (Verteilung ≤ Eingang).
 */
export async function receivedByKey(
  productionOrderId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('goods_receipt_items')
    .select(
      'quantity, goods_receipts!inner(production_order_id), production_order_items!inner(product_id, color, size)',
    )
    .eq('goods_receipts.production_order_id', productionOrderId)

  if (error) throw error

  const map = new Map<string, number>()
  for (const row of (data ?? []) as unknown as {
    quantity: number | null
    production_order_items: {
      product_id: string | null
      color: string | null
      size: string | null
    } | null
  }[]) {
    const poi = row.production_order_items
    if (!poi) continue
    const key = itemKey(poi.product_id, poi.color, poi.size)
    map.set(key, (map.get(key) ?? 0) + (row.quantity ?? 0))
  }
  return map
}

/**
 * Wareneingang erfassen: Kopf + Positionen (nur Mengen > 0). Beim ERSTEN
 * Wareneingang wird die Produktionsbestellung automatisch auf Status „received"
 * gehoben, damit Flag und Realität nicht auseinanderlaufen. Gibt den Kopf zurück.
 *
 * Wirft, wenn keine Position mit Menge > 0 übergeben wird (leerer Wareneingang).
 */
export async function createGoodsReceipt(
  productionOrderId: string,
  receivedDate: string,
  items: ReceiptItemInput[],
  notes: string | null = null,
): Promise<GoodsReceipt> {
  const [org_id, created_by] = await Promise.all([getMyOrgId(), getMyUserId()])

  const rows = items.filter((i) => (i.quantity ?? 0) > 0)
  if (rows.length === 0) {
    throw new Error('Bitte mindestens eine Eingangsmenge größer als 0 erfassen.')
  }

  const { data: receipt, error: headErr } = await supabase
    .from('goods_receipts')
    .insert({
      org_id,
      production_order_id: productionOrderId,
      received_date: receivedDate,
      notes,
      created_by,
    })
    .select()
    .single()

  if (headErr) throw headErr

  const { error: itemsErr } = await supabase.from('goods_receipt_items').insert(
    rows.map((r) => ({
      goods_receipt_id: receipt.id,
      production_order_item_id: r.production_order_item_id,
      quantity: r.quantity,
    })),
  )

  if (itemsErr) {
    // Kopf ohne Positionen ist wertlos — wieder entfernen (kein Waisen-Kopf).
    await supabase.from('goods_receipts').delete().eq('id', receipt.id)
    throw itemsErr
  }

  // Status automatisch auf „received" heben, falls noch nicht gesetzt.
  const { data: po } = await supabase
    .from('production_orders')
    .select('status')
    .eq('id', productionOrderId)
    .single()
  if (po && po.status !== 'received') {
    await supabase
      .from('production_orders')
      .update({ status: 'received' })
      .eq('id', productionOrderId)
  }

  return receipt as GoodsReceipt
}

/** Einen Wareneingang löschen (Positionen per ON DELETE CASCADE mit). */
export async function deleteGoodsReceipt(id: string): Promise<void> {
  const { error } = await supabase.from('goods_receipts').delete().eq('id', id)
  if (error) throw error
}

/**
 * Abgleich Wareneingang ↔ Warenverteilung je Nepal-Position:
 * bestellt (bei Nepal) → eingegangen (real) → verteilt (an Händler).
 *
 * `distributed` wird über den Positions-Schlüssel (Produkt/Farbe/Größe) aus allen
 * Lieferungen der Produktionsbestellung summiert; Positionen ohne Katalog-Treffer
 * (product_id = null) tragen keine Verteilung (können keinen Kundenorders
 * zugeordnet werden).
 */
export async function getReconciliation(
  productionOrderId: string,
): Promise<ReconciliationRow[]> {
  const [poiRes, receivedRes, distRes] = await Promise.all([
    // Nepal-Positionen (Soll) inkl. Produktname.
    supabase
      .from('production_order_items')
      .select('id, product_id, color, size, total_quantity, product:products(name)')
      .eq('production_order_id', productionOrderId)
      .order('created_at', { ascending: true }),
    // Eingegangen je Position.
    supabase
      .from('goods_receipt_items')
      .select('production_order_item_id, quantity, goods_receipts!inner(production_order_id)')
      .eq('goods_receipts.production_order_id', productionOrderId),
    // Verteilt je Schlüssel (alle Lieferungen der Produktionsbestellung).
    supabase
      .from('delivery_items')
      .select('product_id, color, size, quantity, deliveries!inner(production_order_id)')
      .eq('deliveries.production_order_id', productionOrderId),
  ])

  if (poiRes.error) throw poiRes.error
  if (receivedRes.error) throw receivedRes.error
  if (distRes.error) throw distRes.error

  const receivedByPoi = new Map<string, number>()
  for (const r of (receivedRes.data ?? []) as unknown as {
    production_order_item_id: string
    quantity: number | null
  }[]) {
    receivedByPoi.set(
      r.production_order_item_id,
      (receivedByPoi.get(r.production_order_item_id) ?? 0) + (r.quantity ?? 0),
    )
  }

  const distributedByKey = new Map<string, number>()
  for (const d of (distRes.data ?? []) as unknown as {
    product_id: string | null
    color: string | null
    size: string | null
    quantity: number | null
  }[]) {
    const key = itemKey(d.product_id, d.color, d.size)
    distributedByKey.set(key, (distributedByKey.get(key) ?? 0) + (d.quantity ?? 0))
  }

  return ((poiRes.data ?? []) as unknown as {
    id: string
    product_id: string | null
    color: string | null
    size: string | null
    total_quantity: number | null
    product: { name: string } | null
  }[]).map((poi) => ({
    production_order_item_id: poi.id,
    product_id: poi.product_id,
    productName: poi.product?.name ?? '—',
    color: poi.color,
    size: poi.size,
    ordered: poi.total_quantity ?? 0,
    received: receivedByPoi.get(poi.id) ?? 0,
    distributed:
      poi.product_id === null
        ? 0
        : distributedByKey.get(itemKey(poi.product_id, poi.color, poi.size)) ?? 0,
  }))
}
