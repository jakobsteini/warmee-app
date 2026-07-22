import { supabase } from './supabase'
import { itemKey } from './itemKey'
import { getReconciliation } from './goodsReceipts'
import {
  listDeliveryItems,
  orderedQuantities,
  orderedQuantitiesByOrder,
} from './deliveries'
import type {
  PickingCustomer,
  PickingItem,
  PickingListPdfData,
  PickingSummaryRow,
} from './pdf'

/**
 * Baut die Daten für den Kommissionierschein einer Produktionsbestellung —
 * bewusst NUR als Komposition der bestehenden Bildschirm-Quellen, ohne zweite
 * Berechnung (vgl. dueDates-Regel in CLAUDE.md):
 *   - Deckblatt/Abgleich  ← `getReconciliation` (dieselbe Tabelle wie am Schirm)
 *   - Positionen je Kunde ← `listDeliveryItems` (wie auf DeliveryEdit)
 *   - „Bestellt" je Kunde ← `orderedQuantities` (wie auf DeliveryEdit)
 *   - „Eingang (ges.)"    ← die `received`-Werte aus `getReconciliation`, je
 *     Positions-Schlüssel — es ist die Pool-Gesamtmenge, nicht je Kunde.
 *
 * Gibt `null` zurück, wenn es noch keine Verteilung gibt (keine Lieferungen) —
 * dann ist ein Kommissionierschein sinnlos.
 *
 * Mit `onlyDeliveryId` wird der Beleg auf EINEN Kunden (eine Lieferung)
 * eingeschränkt — der Per-Kunde-Nachdruck. Das Deckblatt zeigt weiterhin den
 * Pool-Abgleich der ganzen Produktionsbestellung als Kontext; danach folgt nur
 * die eine Kundenseite.
 */
export async function buildPickingListData(
  productionOrderId: string,
  onlyDeliveryId?: string,
): Promise<PickingListPdfData | null> {
  // Lieferungen der Produktionsbestellung (= je Kunde eine), inkl. Händler und
  // Saison. Reihenfolge nach Händlername für einen vorhersehbaren Stapel.
  const { data: delRows, error: delErr } = await supabase
    .from('deliveries')
    .select(
      'id, dealer_id, order_id, dealer:dealers(name, city, country), order:orders(order_number), production_order:production_orders(season_id, season:seasons(label))',
    )
    .eq('production_order_id', productionOrderId)

  if (delErr) throw delErr

  const deliveries = (delRows ?? []) as unknown as {
    id: string
    dealer_id: string
    order_id: string | null
    dealer: { name: string; city: string | null; country: string | null } | null
    order: { order_number: string | null } | null
    production_order: {
      season_id: string
      season: { label: string } | null
    } | null
  }[]

  if (deliveries.length === 0) return null

  // Per-Kunde-Nachdruck: auf die eine Lieferung einschränken (Deckblatt bleibt
  // der Pool-Abgleich der ganzen Produktionsbestellung als Kontext).
  const selected = onlyDeliveryId
    ? deliveries.filter((d) => d.id === onlyDeliveryId)
    : deliveries
  if (selected.length === 0) return null

  const seasonId = selected[0].production_order?.season_id ?? null
  const seasonLabel = selected[0].production_order?.season?.label ?? null

  // Abgleich (Deckblatt) — dieselbe Quelle wie die Bildschirm-Tabelle.
  const reconciliation = await getReconciliation(productionOrderId)

  // Gesamt-Eingangsmenge je Positions-Schlüssel aus dem Abgleich ableiten
  // (kein zweiter Query) — für die „Eingang (ges.)"-Spalte je Kundenzeile.
  const receivedByItemKey = new Map<string, number>()
  for (const r of reconciliation) {
    receivedByItemKey.set(itemKey(r.product_id, r.color, r.size), r.received)
  }

  const summary: PickingSummaryRow[] = reconciliation.map((r) => ({
    label: [r.productName, r.color, r.size].filter(Boolean).join(' · '),
    ordered: r.ordered,
    received: r.received,
    distributed: r.distributed,
  }))

  // Je Kunde: Positionen + bestellte Mengen (beide wie auf DeliveryEdit).
  const customers: PickingCustomer[] = await Promise.all(
    selected
      .slice()
      .sort((a, b) => (a.dealer?.name ?? '').localeCompare(b.dealer?.name ?? '', 'de'))
      .map(async (d): Promise<PickingCustomer> => {
        const [items, ordered] = await Promise.all([
          listDeliveryItems(d.id),
          // „Bestellt" je Order, sobald der Link gesetzt ist (Split); Alt-
          // Lieferungen ohne order_id fallen auf die Händler-Gesamtmenge zurück.
          d.order_id
            ? orderedQuantitiesByOrder(d.order_id)
            : seasonId
              ? orderedQuantities(seasonId, d.dealer_id)
              : Promise.resolve(new Map<string, number>()),
        ])

        const pickItems: PickingItem[] = items.map((it) => {
          const key = itemKey(it.product_id, it.color, it.size)
          return {
            productName: it.product?.name ?? '—',
            color: it.color,
            size: it.size,
            pick: it.quantity ?? 0,
            ordered: ordered.get(key) ?? 0,
            received: receivedByItemKey.get(key) ?? 0,
          }
        })

        const place = [d.dealer?.city, d.dealer?.country].filter(Boolean).join(', ')
        return {
          dealerName: d.dealer?.name ?? '—',
          place: place || null,
          orderNumber: d.order?.order_number ?? null,
          items: pickItems,
        }
      }),
  )

  return {
    seasonLabel,
    date: new Date().toISOString(),
    summary,
    customers,
  }
}
