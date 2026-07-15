/**
 * Gemeinsamer Positions-Schlüssel Produkt + Farbe + Größe. Bewusst neutral in
 * einem eigenen Modul, damit sowohl die Verteilung (deliveries) als auch der
 * Wareneingang (goodsReceipts) denselben Schlüssel nutzen, ohne dass die Module
 * sich gegenseitig importieren (kein Zyklus).
 */
export function itemKey(
  product_id: string | null,
  color: string | null,
  size: string | null,
): string {
  return `${product_id ?? ''}||${color ?? ''}||${size ?? ''}`
}
