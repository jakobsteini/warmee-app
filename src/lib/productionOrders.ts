import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import {
  bundleOpenItems,
  missingProducerArticleNames,
  type BundleOrderItem,
} from './supplierBundleCalc'
import type {
  ProductionOrder,
  ProductionOrderItemWithProduct,
  ProductionOrderListRow,
  ProductionStatus,
} from '../types/productionOrder'

/**
 * Alle Produktionsbestellungen der eigenen Org (RLS scoped automatisch),
 * neueste zuerst. Saison-Label, Produzentenname und die Positions-Stückzahlen
 * werden mitgeladen, damit die Übersicht ohne Nachladen alles zeigen kann.
 */
export async function listProductionOrders(): Promise<ProductionOrderListRow[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(
      'id, org_id, season_id, producer_id, status, generated_at, sent_at, notes, created_by, created_at, season:seasons(label), producer:producers(name), production_order_items(total_quantity)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ProductionOrderListRow[]
}

/** Eine einzelne Produktionsbestellung laden. */
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
 * Alle Positionen einer Produktionsbestellung inkl. Produktname, sortiert nach
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

/** Rohzeile aus dem order_items-Join (mit Lieferant des Artikels). */
interface RawOpenItem {
  id: string
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  products: { producer_id: string | null; name: string } | null
}

/** Ergebnis-Zeile je erzeugter Sammelbestellung (für die UI-Rückmeldung). */
export interface GeneratedSupplierOrder {
  productionOrderId: string
  producerId: string
  producerName: string
  positions: number
  pieces: number
}

/**
 * Lieferanten-Sammelbestellungen aus den OFFENEN bestätigten Orders einer Saison
 * generieren — Modul A. Bündelt je Lieferant (products.producer_id): pro
 * Lieferant EINE production_orders (Status draft) mit nach Produkt/Farbe/Größe
 * aggregierten Positionen. Der Bündel-Kern ist supabase-frei
 * ({@link bundleOpenItems}); hier nur Laden/Schreiben.
 *
 * „Offen" = order_items, die in KEINER Sammelbestellung stecken
 * (supplier_order_sources). Die verbrauchten Positionen werden verknüpft, damit
 * später bestätigte AB als Nachbestellung erfasst werden (kein Doppelzählen).
 *
 * Hard-Block (kein stiller Verlust): Gibt es offene Positionen mit einem Artikel
 * OHNE producer_id, wirft die Funktion mit der Liste der betroffenen Artikel —
 * diese müssen erst einem Lieferanten zugeordnet werden.
 *
 * Wirft außerdem, wenn keine bestätigten Orders bzw. keine offenen Positionen
 * existieren.
 */
export async function generateSupplierOrders(
  seasonId: string,
): Promise<GeneratedSupplierOrder[]> {
  const [org_id, created_by] = await Promise.all([getMyOrgId(), getMyUserId()])

  // Positionen bestätigter Orders der Saison inkl. Lieferant des Artikels. Der
  // !inner-Join filtert auf Order-Ebene (Saison + Status); RLS scoped auf die Org.
  const { data: rawItems, error: itemsError } = await supabase
    .from('order_items')
    .select(
      'id, product_id, color, size, quantity, orders!inner(season_id, status), products!inner(producer_id, name)',
    )
    .eq('orders.season_id', seasonId)
    .eq('orders.status', 'confirmed')
  if (itemsError) throw itemsError

  const raw = (rawItems ?? []) as unknown as RawOpenItem[]
  if (raw.length === 0) {
    throw new Error(
      'Keine bestätigten Orders mit Artikeln in dieser Saison gefunden.',
    )
  }

  // Bereits verbrauchte Positionen (org-scoped via RLS) → „offen" ableiten.
  const { data: consumedRows, error: consumedErr } = await supabase
    .from('supplier_order_sources')
    .select('order_item_id')
  if (consumedErr) throw consumedErr
  const consumed = new Set(
    (consumedRows ?? []).map((r) => (r as { order_item_id: string }).order_item_id),
  )

  const items: BundleOrderItem[] = raw.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    producer_id: r.products?.producer_id ?? null,
    product_name: r.products?.name ?? 'Artikel',
    color: r.color,
    size: r.size,
    quantity: r.quantity ?? 0,
  }))

  const result = bundleOpenItems(items, consumed)

  // Hard-Block: Positionen ohne Lieferant erst zuordnen (kein Sammeltopf).
  if (result.missingProducer.length > 0) {
    const names = missingProducerArticleNames(result)
    throw new Error(
      `Folgende Artikel haben keinen Lieferanten und müssen zuerst zugeordnet werden: ${names.join(', ')}.`,
    )
  }

  if (result.byProducer.length === 0) {
    throw new Error(
      'Keine offenen Auftragspositionen — für diese Saison ist bereits alles bestellt.',
    )
  }

  // Lieferantennamen für die Rückmeldung.
  const producerIds = result.byProducer.map((b) => b.producer_id)
  const { data: prods, error: prodErr } = await supabase
    .from('producers')
    .select('id, name')
    .in('id', producerIds)
  if (prodErr) throw prodErr
  const nameById = new Map(
    (prods ?? []).map((p) => [
      (p as { id: string }).id,
      (p as { name: string }).name,
    ]),
  )

  const generatedAt = new Date().toISOString()
  const created: GeneratedSupplierOrder[] = []
  const createdIds: string[] = []
  try {
    for (const bundle of result.byProducer) {
      const { data: po, error: poErr } = await supabase
        .from('production_orders')
        .insert({
          org_id,
          season_id: seasonId,
          producer_id: bundle.producer_id,
          generated_at: generatedAt,
          created_by,
        })
        .select('id')
        .single()
      if (poErr) throw poErr
      createdIds.push(po.id)

      const itemRows = bundle.positions.map((p) => ({
        production_order_id: po.id,
        product_id: p.product_id,
        color: p.color,
        size: p.size,
        total_quantity: p.total,
      }))
      const { error: piErr } = await supabase
        .from('production_order_items')
        .insert(itemRows)
      if (piErr) throw piErr

      // Quell-Verknüpfung: diese order_items sind jetzt verbraucht. Der
      // unique(order_item_id)-Index fängt eine parallele Doppelvergabe hart ab.
      const sourceRows = bundle.sourceItemIds.map((oid) => ({
        org_id,
        production_order_id: po.id,
        order_item_id: oid,
      }))
      const { error: sErr } = await supabase
        .from('supplier_order_sources')
        .insert(sourceRows)
      if (sErr) throw sErr

      created.push({
        productionOrderId: po.id,
        producerId: bundle.producer_id,
        producerName: nameById.get(bundle.producer_id) ?? '—',
        positions: bundle.positions.length,
        pieces: bundle.positions.reduce((s, p) => s + p.total, 0),
      })
    }
  } catch (err) {
    // Teilweise angelegte Bestellungen wieder entfernen (Positionen + Quell-Links
    // per ON DELETE CASCADE) — kein inkonsistenter Zustand.
    if (createdIds.length > 0) {
      await supabase.from('production_orders').delete().in('id', createdIds)
    }
    throw err
  }

  return created
}

/**
 * Status einer Produktionsbestellung ändern. Beim Übergang auf „Gesendet" wird
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

/** Notiz einer Produktionsbestellung aktualisieren. */
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

/** Transportkosten einer Produktionsbestellung aktualisieren (null = leer). */
export async function updateProductionTransportkosten(
  id: string,
  transportkosten: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('production_orders')
    .update({ transportkosten })
    .eq('id', id)
  if (error) throw error
}

/** Produktionsbestellung löschen (Positionen per ON DELETE CASCADE mit). */
export async function deleteProductionOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('production_orders')
    .delete()
    .eq('id', id)
  if (error) throw error
}
