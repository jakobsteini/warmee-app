import { readInventoryStock } from './inventory'
import { listProducts } from './products'
import { listAssets } from './assets'
import {
  aggregateStock,
  normalizeColorKey,
  totalPieces,
  type ProductMeta,
} from './stockListCalc'
import type { StockListPdfData, StockListRow } from './pdf'

/**
 * Ein Bild (Signed-URL) laden und als dataURL zurückgeben — für die Einbettung
 * ins PDF (jsPDF braucht dataURL, nicht die private Signed-URL). NIE werfen:
 * eine fehlende/fehlerhafte URL, ein Netzwerk-/CORS-Fehler → null, damit das
 * PDF trotzdem baut (die Zelle bleibt leer).
 */
async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Daten für die Kunden-Lagerliste — Komposition der bestehenden Quellen, keine
 * zweite Berechnung (vgl. Kommissionierschein):
 *   - Bestand ← inventory_stock, NUR warehouse='bestand' (Bestandslager)
 *   - Artikel/VK-GH ← listProducts (Name + Großhandelspreis)
 *   - Aggregation/Filter/Sortierung ← stockListCalc.aggregateStock
 *   - Muster-Foto je (Artikel, Farbe): Swatch-by-Farbe → Produktfoto → leer
 *
 * Foto-Matching: die Bestandsfarbe (Freitext, z. B. "Camel") wird normalisiert
 * (lower/trim) gegen die Swatch-Farbcodes/-namen gematcht. Kein Treffer →
 * Produktfoto des Artikels → sonst leer. NIE ein ungefährer Swatch.
 */
export async function buildStockListData(): Promise<StockListPdfData> {
  const [stock, products, swatches, productPhotos] = await Promise.all([
    readInventoryStock({ warehouse: 'bestand' }),
    listProducts(),
    listAssets({ asset_type: 'swatch' }),
    listAssets({ asset_type: 'product' }),
  ])

  const meta = new Map<string, ProductMeta>(
    products.map((p) => [p.id, { name: p.name, wholesale_price: p.wholesale_price }]),
  )

  const agg = aggregateStock(
    stock.map((r) => ({ product_id: r.product_id, color: r.color, bestand: r.bestand })),
    meta,
  )

  // Swatch-Index: normalisierter Farb-Schlüssel → Signed-URL. Farbcode und
  // Farbname (inkl. Zweitfarbe) werden als Schlüssel aufgenommen; der erste
  // Treffer je Schlüssel gewinnt.
  const swatchUrlByColor = new Map<string, string>()
  for (const s of swatches) {
    if (!s.url) continue
    for (const c of [s.color_name, s.color_code, s.color_name_2, s.color_code_2]) {
      const key = normalizeColorKey(c)
      if (key && !swatchUrlByColor.has(key)) swatchUrlByColor.set(key, s.url)
    }
  }

  // Produktfoto je Artikel: erstes Bild mit URL (listAssets liefert neueste zuerst).
  const photoByProduct = new Map<string, string>()
  for (const a of productPhotos) {
    if (a.product_id && a.url && !photoByProduct.has(a.product_id)) {
      photoByProduct.set(a.product_id, a.url)
    }
  }

  // Fotos parallel auflösen (jeweils abgesichert → null bei Fehler).
  const rows: StockListRow[] = await Promise.all(
    agg.map(async (r): Promise<StockListRow> => {
      const url =
        swatchUrlByColor.get(normalizeColorKey(r.color)) ??
        photoByProduct.get(r.product_id) ??
        null
      const photo = url ? await urlToDataUrl(url) : null
      return {
        article: r.article,
        color: r.color,
        pieces: r.pieces,
        wholesalePrice: r.wholesalePrice,
        photo,
      }
    }),
  )

  return {
    date: new Date().toISOString(),
    rows,
    totalPieces: totalPieces(agg),
  }
}
