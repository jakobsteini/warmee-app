import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import {
  bundleOpenItems,
  missingProducerArticleNames,
  type BundleOrderItem,
} from './supplierBundleCalc'
import { isSupplierOrderLocked } from '../types/productionOrder'
import { itemKey } from './itemKey'
import {
  allocateByPriority,
  type AllocationClaim,
  type AllocationResult,
} from './supplierAllocationCalc'
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
      'id, org_id, season_id, producer_id, status, supplier_order_number, generated_at, sent_at, notes, created_by, created_at, season:seasons(label), producer:producers(name), production_order_items(total_quantity)',
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
          // Seed früh einfrieren → Vorschau (Entwurf) und Snapshot (ab „gesendet")
          // liefern denselben Tie-Break bei der Prioritäts-Aufteilung.
          priority_seed: Math.floor(Math.random() * 2147483647),
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
  const patch: {
    status: ProductionStatus
    sent_at?: string
    supplier_order_number?: string
  } = { status }

  // Beim Übergang auf „Gesendet": sent_at setzen (falls leer) und eine lückenlose
  // Nummer ziehen (nur wenn noch keine — idempotent, erneutes 'sent' vergibt keine
  // zweite Nummer). Race-Sicherheit wie bei der Auftrags-/Rechnungsnummer:
  // max+1 aus der DB (next_supplier_order_number) + Unique-Index fängt eine
  // kollidierende Parallelvergabe ab.
  if (status === 'sent') {
    const { data: cur, error: curErr } = await supabase
      .from('production_orders')
      .select('sent_at, supplier_order_number')
      .eq('id', id)
      .single()
    if (curErr) throw curErr
    if (!cur.sent_at) patch.sent_at = new Date().toISOString()
    if (!cur.supplier_order_number) {
      const org_id = await getMyOrgId()
      const { data: num, error: numErr } = await supabase.rpc(
        'next_supplier_order_number',
        { p_org_id: org_id },
      )
      if (numErr) throw numErr
      patch.supplier_order_number = num as string
    }
    // Prioritäts-Aufteilung einfrieren, BEVOR der Status auf „gesendet" kippt —
    // schlägt das Einfrieren fehl, bleibt die Bestellung Entwurf (kein „gesendet"
    // ohne Snapshot).
    await freezeSupplierOrderAllocation(id)
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

/**
 * Produktionsbestellung löschen (Positionen + Quell-Links per ON DELETE CASCADE
 * mit). Snapshot-Schutz: eine gesendete (oder weitere) Bestellung ist eingefroren
 * und kann NICHT gelöscht werden — sonst verlöre man Nummer und die
 * AB-Verknüpfung still. Nur Entwürfe sind löschbar (danach wieder bündelbar).
 */
export async function deleteProductionOrder(id: string): Promise<void> {
  const { data: po, error: getErr } = await supabase
    .from('production_orders')
    .select('status')
    .eq('id', id)
    .single()
  if (getErr) throw getErr
  if (isSupplierOrderLocked(po.status)) {
    throw new Error(
      'Eine gesendete Sammelbestellung ist eingefroren und kann nicht gelöscht werden.',
    )
  }

  const { error } = await supabase
    .from('production_orders')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ─── Prioritäts-Aufteilung (Modul D) ─────────────────────────────────────────

/**
 * Manuelle Bestellmenge einer Position setzen (null → es gilt der Bedarf).
 * Snapshot-Schutz: bei gesendeter (eingefrorener) Bestellung blockt die Funktion
 * mit sichtbarem Fehler statt stiller Änderung.
 */
export async function updateProductionItemOrderQuantity(
  itemId: string,
  orderQuantity: number | null,
): Promise<void> {
  const { data: item, error: itErr } = await supabase
    .from('production_order_items')
    .select('production_order_id')
    .eq('id', itemId)
    .single()
  if (itErr) throw itErr

  const { data: po, error: poErr } = await supabase
    .from('production_orders')
    .select('status')
    .eq('id', item.production_order_id)
    .single()
  if (poErr) throw poErr
  if (isSupplierOrderLocked(po.status)) {
    throw new Error(
      'Die Sammelbestellung ist gesendet und eingefroren — die Menge kann nicht mehr geändert werden.',
    )
  }

  const { error } = await supabase
    .from('production_order_items')
    .update({ order_quantity: orderQuantity })
    .eq('id', itemId)
  if (error) throw error
}

/** Eine Position samt Prioritäts-Aufteilung auf die beitragenden Kunden. */
export interface AllocationPreviewPosition {
  itemId: string
  productId: string | null
  productName: string
  color: string | null
  size: string | null
  /** Bedarf (aggregiert aus den Aufträgen). */
  demand: number
  /** Genutzte Bestellmenge (order_quantity ?? demand). */
  orderQuantity: number
  allocations: AllocationResult[]
}

/**
 * Prioritäts-Aufteilung einer Sammelbestellung berechnen (Vorschau bei Entwürfen;
 * dieselbe Rechnung wird beim „gesendet" eingefroren). Delegiert an den
 * supabase-freien Kern {@link allocateByPriority} mit dem eingefrorenen
 * priority_seed. Datenquelle = die verbrauchten order_items (supplier_order_sources)
 * inkl. Häkchen (orders.priority) und dealer_season_priority.
 */
export async function getAllocationPreview(
  productionOrderId: string,
): Promise<AllocationPreviewPosition[]> {
  const { data: po, error: poErr } = await supabase
    .from('production_orders')
    .select('id, season_id, priority_seed')
    .eq('id', productionOrderId)
    .single()
  if (poErr) throw poErr
  const seed = po.priority_seed ?? 0

  const { data: poItemsRaw, error: piErr } = await supabase
    .from('production_order_items')
    .select('id, product_id, color, size, total_quantity, order_quantity, product:products(name)')
    .eq('production_order_id', productionOrderId)
  if (piErr) throw piErr
  const poItems = (poItemsRaw ?? []) as unknown as {
    id: string
    product_id: string | null
    color: string | null
    size: string | null
    total_quantity: number
    order_quantity: number | null
    product: { name: string } | null
  }[]

  // Beitragende order_items dieser Sammelbestellung.
  const { data: srcRows, error: srcErr } = await supabase
    .from('supplier_order_sources')
    .select('order_item_id')
    .eq('production_order_id', productionOrderId)
  if (srcErr) throw srcErr
  const orderItemIds = (srcRows ?? []).map((r) => (r as { order_item_id: string }).order_item_id)

  // Claims je Positions-Schlüssel aufbauen (leer, wenn keine Quellen).
  const claimsByKey = new Map<string, Map<string, AllocationClaim>>()
  if (orderItemIds.length > 0) {
    const { data: oiRaw, error: oiErr } = await supabase
      .from('order_items')
      .select('product_id, color, size, quantity, order_id')
      .in('id', orderItemIds)
    if (oiErr) throw oiErr
    const orderItems = (oiRaw ?? []) as unknown as {
      product_id: string
      color: string | null
      size: string | null
      quantity: number
      order_id: string
    }[]

    const orderIds = [...new Set(orderItems.map((o) => o.order_id))]
    const { data: ordersRaw, error: ordErr } = await supabase
      .from('orders')
      .select('id, dealer_id, priority, dealer:dealers(name)')
      .in('id', orderIds)
    if (ordErr) throw ordErr
    const orderById = new Map(
      ((ordersRaw ?? []) as unknown as {
        id: string
        dealer_id: string
        priority: boolean
        dealer: { name: string } | null
      }[]).map((o) => [o.id, o]),
    )

    const dealerIds = [...new Set([...orderById.values()].map((o) => o.dealer_id))]
    const seasonPriorityByDealer = new Map<string, number>()
    if (dealerIds.length > 0) {
      const { data: dspRaw, error: dspErr } = await supabase
        .from('dealer_season_priority')
        .select('dealer_id, priority')
        .eq('season_id', po.season_id)
        .in('dealer_id', dealerIds)
      if (dspErr) throw dspErr
      for (const d of (dspRaw ?? []) as { dealer_id: string; priority: number }[]) {
        seasonPriorityByDealer.set(d.dealer_id, d.priority)
      }
    }

    for (const oi of orderItems) {
      const order = orderById.get(oi.order_id)
      if (!order) continue
      const key = itemKey(oi.product_id, oi.color, oi.size)
      let byOrder = claimsByKey.get(key)
      if (!byOrder) {
        byOrder = new Map()
        claimsByKey.set(key, byOrder)
      }
      const existing = byOrder.get(oi.order_id)
      if (existing) {
        existing.demand += oi.quantity ?? 0
      } else {
        byOrder.set(oi.order_id, {
          orderId: oi.order_id,
          dealerId: order.dealer_id,
          dealerName: order.dealer?.name ?? '—',
          priorityFlag: order.priority ?? false,
          seasonPriority: seasonPriorityByDealer.get(order.dealer_id) ?? null,
          demand: oi.quantity ?? 0,
        })
      }
    }
  }

  return poItems.map((it) => {
    const capacity = it.order_quantity ?? it.total_quantity
    const claims = [...(claimsByKey.get(itemKey(it.product_id, it.color, it.size))?.values() ?? [])]
    return {
      itemId: it.id,
      productId: it.product_id,
      productName: it.product?.name ?? 'Artikel',
      color: it.color,
      size: it.size,
      demand: it.total_quantity,
      orderQuantity: capacity,
      allocations: allocateByPriority(claims, capacity, seed),
    }
  })
}

/**
 * Prioritäts-Aufteilung als Snapshot festschreiben (beim Übergang auf „gesendet").
 * Idempotent: alte Allokation der Bestellung wird ersetzt. Nur Zuteilungen > 0
 * werden gespeichert (ein Kunde mit 0 bekommt keine Lieferung).
 */
export async function freezeSupplierOrderAllocation(
  productionOrderId: string,
): Promise<void> {
  const org_id = await getMyOrgId()
  const positions = await getAllocationPreview(productionOrderId)

  await supabase
    .from('supplier_order_allocations')
    .delete()
    .eq('production_order_id', productionOrderId)

  const rows = positions.flatMap((p) =>
    p.allocations
      .filter((a) => a.allocated > 0)
      .map((a) => ({
        org_id,
        production_order_id: productionOrderId,
        order_id: a.orderId,
        product_id: p.productId,
        color: p.color,
        size: p.size,
        allocated_quantity: a.allocated,
      })),
  )
  if (rows.length > 0) {
    const { error } = await supabase
      .from('supplier_order_allocations')
      .insert(rows)
    if (error) throw error
  }
}
