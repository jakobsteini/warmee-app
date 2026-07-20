// Daten-Builder für die Auftragsbestätigung (AB) als PDF. Wegwerf-Dokument:
// keine Persistenz/DB/Storage (die order_number ist bereits persistent). Die
// MwSt ist reine VORSCHAU (taxCalc lesend) — hier wird NICHTS eingefroren; die
// verbindliche Steuer kommt erst mit der Rechnung (Snapshot dort).
//
// Zweisprachig über eine kompakte de/en-Label-Tabelle, gewählt nach
// dealer.language (de-Fallback). Der Steuer-Pflichthinweis kommt bilingual direkt
// aus taxCalc (note.de/note.en). Volltext-Übersetzung aller Strings ist ein
// späterer Baustein — die Struktur ist de/en-fähig.
import { getOrder, listOrderItems } from './orders'
import { getDealer } from './dealers'
import { listAssets } from './assets'
import { listOssRates, ossRateMap } from './ossRates'
import { taxCalc, applyVat as applyVatAt } from './taxCalc'
import { totalQuantity, totalAmount } from './orderCalc'
import { normalizeColorKey } from './stockListCalc'
import { urlToDataUrl } from './stockList'
import type {
  OrderConfirmationItem,
  OrderConfirmationLabels,
  OrderConfirmationPdfData,
  OrderConfirmationTax,
} from './pdf'

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Beleg-Labels + Wert-Übersetzungen je Sprache. */
interface AbTexts extends OrderConfirmationLabels {
  orderTypeValues: Record<string, string>
  shipMethodValues: Record<string, string>
}

const AB_TEXTS: Record<'de' | 'en', AbTexts> = {
  de: {
    title: 'Auftragsbestätigung',
    recipient: 'Kunde',
    number: 'Auftragsnr.',
    date: 'Orderdatum',
    orderType: 'Order-Art',
    shipMethod: 'Versandart',
    deliveryPeriod: 'Liefertermin',
    colPhoto: 'Foto',
    colArticle: 'Artikel',
    colColor: 'Farbe',
    colSize: 'Größe',
    colQty: 'Menge',
    colUnit: 'Einzelpreis',
    colSum: 'Summe',
    totalPieces: 'Gesamt Stück',
    subtotal: 'Nettobetrag',
    vat: 'USt',
    gross: 'Gesamtbetrag (brutto)',
    taxHint: 'Voraussichtliche Steuer — verbindlich mit der Rechnung.',
    taxUncertain: 'Die Steuer wird mit der Rechnungserstellung final ermittelt.',
    orderTypeValues: { vororder: 'Vororder', prompt: 'Prompt Order', lager: 'Lagerorder' },
    shipMethodValues: { dpd: 'DPD', dsv: 'DSV' },
  },
  en: {
    title: 'Order confirmation',
    recipient: 'Customer',
    number: 'Order no.',
    date: 'Order date',
    orderType: 'Order type',
    shipMethod: 'Shipping method',
    deliveryPeriod: 'Delivery date',
    colPhoto: 'Photo',
    colArticle: 'Article',
    colColor: 'Colour',
    colSize: 'Size',
    colQty: 'Qty',
    colUnit: 'Unit price',
    colSum: 'Sum',
    totalPieces: 'Total pieces',
    subtotal: 'Net amount',
    vat: 'VAT',
    gross: 'Total (gross)',
    taxHint: 'Estimated tax — binding with the invoice.',
    taxUncertain: 'The tax is determined when the invoice is created.',
    orderTypeValues: { vororder: 'Pre-order', prompt: 'Prompt order', lager: 'Stock order' },
    shipMethodValues: { dpd: 'DPD', dsv: 'DSV' },
  },
}

/**
 * AB-PDF-Daten für eine Order zusammenstellen. Komposition bestehender Quellen —
 * keine zweite Rechenlogik: Stück/Summe aus orderCalc, Steuer-Vorschau aus
 * taxCalc, Fotos wie bei der Lagerliste (Swatch-je-Farbe ?? Produktfoto).
 */
export async function buildOrderConfirmationData(
  orderId: string,
): Promise<OrderConfirmationPdfData> {
  const order = await getOrder(orderId)
  const [dealer, items, swatches, productPhotos, oss] = await Promise.all([
    getDealer(order.dealer_id),
    listOrderItems(orderId),
    listAssets({ asset_type: 'swatch' }),
    listAssets({ asset_type: 'product' }),
    listOssRates().catch(() => []),
  ])

  const lang: 'de' | 'en' = dealer.language === 'en' ? 'en' : 'de'
  const texts = AB_TEXTS[lang]

  // Foto-Index wie bei der Lagerliste: Swatch je (normalisierter) Farbe, sonst
  // Produktfoto des Artikels, sonst null. Erster Treffer gewinnt.
  const swatchUrlByColor = new Map<string, string>()
  for (const s of swatches) {
    if (!s.url) continue
    for (const c of [s.color_name, s.color_code, s.color_name_2, s.color_code_2]) {
      const key = normalizeColorKey(c)
      if (key && !swatchUrlByColor.has(key)) swatchUrlByColor.set(key, s.url)
    }
  }
  const photoByProduct = new Map<string, string>()
  for (const a of productPhotos) {
    if (a.product_id && a.url && !photoByProduct.has(a.product_id)) {
      photoByProduct.set(a.product_id, a.url)
    }
  }

  const pdfItems: OrderConfirmationItem[] = await Promise.all(
    items.map(async (it): Promise<OrderConfirmationItem> => {
      const url =
        swatchUrlByColor.get(normalizeColorKey(it.color)) ??
        photoByProduct.get(it.product_id) ??
        null
      const photo = url ? await urlToDataUrl(url) : null
      const unitPrice = num(it.unit_price)
      return {
        photo,
        description: it.product?.name ?? 'Artikel',
        color: it.color,
        size: it.size,
        quantity: it.quantity,
        unitPrice,
        lineTotal: it.quantity * unitPrice,
      }
    }),
  )

  const subtotal = totalAmount(items)
  const totalPieces = totalQuantity(items)

  // MwSt-VORSCHAU (nicht eingefroren). Unsichere Lage (kein Land / ossMissing /
  // review) → nur Hinweis, kein Satz.
  let tax: OrderConfirmationTax
  if (!dealer.country_iso2) {
    tax = { uncertain: true }
  } else {
    const r = taxCalc(
      {
        customer_group: dealer.customer_group,
        country_iso2: dealer.country_iso2,
        uid: dealer.uid,
      },
      ossRateMap(oss),
    )
    if (r.ossMissing || r.review) {
      tax = { uncertain: true }
    } else {
      const { vat, gross } = applyVatAt(subtotal, r.rate)
      const note = r.note ? (lang === 'en' ? r.note.en : r.note.de) : null
      tax = { uncertain: false, rate: r.rate, vat, gross, note }
    }
  }

  return {
    number: order.order_number ?? '',
    date: order.created_at ?? new Date().toISOString(),
    dealer: {
      name: dealer.name,
      contact_name: dealer.contact_name,
      email: dealer.email,
      city: dealer.city,
      country: dealer.country,
    },
    labels: texts,
    head: {
      orderType: order.order_type
        ? (texts.orderTypeValues[order.order_type] ?? order.order_type)
        : null,
      shipMethod: order.shipping_method
        ? (texts.shipMethodValues[order.shipping_method] ?? order.shipping_method)
        : null,
      deliveryFrom: order.delivery_date_from,
      deliveryTo: order.delivery_date_to,
    },
    items: pdfItems,
    totalPieces,
    subtotal,
    tax,
  }
}
