import { jsPDF } from 'jspdf'
import { ZAHLUNGSZIEL_HINWEIS, type Dealerish } from '../types/invoice'
import { VAT_RATE_PERCENT } from './tax'

/**
 * Absenderdaten für Belege. Zentral hier, damit Rechnung und Lieferschein
 * denselben Kopf tragen. (Straße/UID bei Bedarf ergänzen.)
 */
const SENDER = {
  name: 'WARM ME',
  lines: ['Slow Fashion Cashmere', '5020 Salzburg · Österreich'],
} as const

/** Betrag als EUR (de-DE) fürs PDF. */
function eur(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/** ISO-Datum als deutsches Kurzdatum. */
function deDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Eine Position auf dem Beleg (Preise optional → Lieferschein ohne Preise). */
export interface BelegItem {
  description: string
  color: string | null
  size: string | null
  quantity: number
  unitPrice?: number
  lineTotal?: number
}

/** Empfänger-/Kopfblock, gemeinsam für Rechnung und Lieferschein. */
interface BelegHeader {
  /** Dokumenttitel, z. B. „Rechnung" oder „Lieferschein". */
  title: string
  /** Belegnummer (YYYY-0001 bzw. LS-YYYY-0001). */
  number: string
  date: string
  dealer: Dealerish
  /** Zusätzliche Kopfzeilen rechts (z. B. Fällig am, Saison). */
  meta?: { label: string; value: string }[]
}

const MARGIN = 18
const PAGE_W = 210 // A4 hoch, mm

/** Kopf (Absender, Empfänger, Titel, Belegdaten) rendern, Y-Cursor zurück. */
function drawHeader(doc: jsPDF, h: BelegHeader): number {
  // Absender.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 26, 26)
  doc.text(SENDER.name.toUpperCase(), MARGIN, 22, { charSpace: 1.5 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 115, 108)
  SENDER.lines.forEach((line, i) => doc.text(line, MARGIN, 28 + i * 4.5))

  // Empfänger (Händler).
  doc.setTextColor(120, 115, 108)
  doc.setFontSize(8)
  doc.text('Rechnungsempfänger', MARGIN, 48)

  doc.setTextColor(26, 26, 26)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(h.dealer.name, MARGIN, 54)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 85, 80)
  let ry = 59.5
  if (h.dealer.contact_name) {
    doc.text(h.dealer.contact_name, MARGIN, ry)
    ry += 4.5
  }
  const place = [h.dealer.city, h.dealer.country].filter(Boolean).join(', ')
  if (place) {
    doc.text(place, MARGIN, ry)
    ry += 4.5
  }
  if (h.dealer.email) {
    doc.text(h.dealer.email, MARGIN, ry)
    ry += 4.5
  }

  // Titel + Belegdaten (rechtsbündig).
  const right = PAGE_W - MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(26, 26, 26)
  doc.text(h.title, right, 22, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const metaRows = [
    { label: 'Nr.', value: h.number },
    { label: 'Datum', value: deDate(h.date) },
    ...(h.meta ?? []),
  ]
  let my = 30
  for (const row of metaRows) {
    doc.setTextColor(120, 115, 108)
    doc.text(row.label, right - 42, my)
    doc.setTextColor(26, 26, 26)
    doc.text(row.value, right, my, { align: 'right' })
    my += 5
  }

  return Math.max(ry, 74)
}

/** Positionstabelle rendern (Preisspalten optional), Y-Cursor zurück. */
function drawItemsTable(
  doc: jsPDF,
  items: BelegItem[],
  startY: number,
  withPrices: boolean,
): number {
  const right = PAGE_W - MARGIN
  // Spalten-X. Ohne Preise wird der Platz für Beschreibung/Farbe genutzt.
  const cols = withPrices
    ? { desc: MARGIN, color: 96, size: 122, qty: 150, unit: 175, total: right }
    : { desc: MARGIN, color: 120, size: 160, qty: right }

  let y = startY + 6
  // Kopfzeile.
  doc.setFillColor(241, 239, 234)
  doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(90, 85, 80)
  doc.text('Artikel', cols.desc + 1, y)
  doc.text('Farbe', cols.color, y)
  doc.text('Größe', cols.size, y)
  if (withPrices) {
    doc.text('Menge', cols.qty!, y, { align: 'right' })
    doc.text('Einzelpreis', cols.unit!, y, { align: 'right' })
    doc.text('Summe', cols.total!, y, { align: 'right' })
  } else {
    doc.text('Menge', cols.qty as number, y, { align: 'right' })
  }
  y += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const it of items) {
    y += 6
    if (y > 262) {
      doc.addPage()
      y = 26
    }
    doc.setTextColor(26, 26, 26)
    doc.text(String(it.description), cols.desc + 1, y, { maxWidth: 74 })
    doc.setTextColor(90, 85, 80)
    doc.text(it.color ?? '—', cols.color, y)
    doc.text(it.size ?? '—', cols.size, y)
    doc.setTextColor(26, 26, 26)
    if (withPrices) {
      doc.text(String(it.quantity), cols.qty!, y, { align: 'right' })
      doc.text(eur(it.unitPrice ?? 0), cols.unit!, y, { align: 'right' })
      doc.text(eur(it.lineTotal ?? 0), cols.total!, y, { align: 'right' })
    } else {
      doc.text(String(it.quantity), cols.qty as number, y, { align: 'right' })
    }
    doc.setDrawColor(230, 227, 222)
    doc.line(MARGIN, y + 2.5, right, y + 2.5)
  }
  return y + 8
}

/** Fußzeile mit Absender-Kurzinfo. */
function drawFooter(doc: jsPDF) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(150, 145, 138)
  doc.text(
    `${SENDER.name} · ${SENDER.lines.join(' · ')}`,
    PAGE_W / 2,
    288,
    { align: 'center' },
  )
}

/** Daten für die Rechnungs-PDF. */
export interface InvoicePdfData {
  number: string
  date: string
  dueDate: string | null
  dealer: Dealerish
  items: BelegItem[]
  /** Nettobetrag (Summe der Positionen ohne USt). */
  subtotal: number
  /** Ausgewiesene Umsatzsteuer (20 % auf den Nettobetrag). */
  tax: number
  /** Bruttobetrag (Netto + USt). */
  total: number
  notes: string | null
}

/** Rechnung als PDF-Blob erzeugen (mit Preisen und Steuerausweisung Netto/USt/Brutto). */
export function buildInvoicePdf(data: InvoicePdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const meta = data.dueDate
    ? [{ label: 'Fällig am', value: deDate(data.dueDate) }]
    : []
  const headerBottom = drawHeader(doc, {
    title: 'Rechnung',
    number: data.number,
    date: data.date,
    dealer: data.dealer,
    meta,
  })

  let y = drawItemsTable(doc, data.items, headerBottom, true)

  // Summen (rechtsbündig).
  const right = PAGE_W - MARGIN
  y += 2
  doc.setFontSize(9.5)
  doc.setTextColor(90, 85, 80)
  doc.text('Nettobetrag', right - 42, y)
  doc.setTextColor(26, 26, 26)
  doc.text(eur(data.subtotal), right, y, { align: 'right' })

  y += 5
  doc.setTextColor(90, 85, 80)
  doc.text(`USt (${VAT_RATE_PERCENT} %)`, right - 42, y)
  doc.setTextColor(26, 26, 26)
  doc.text(eur(data.tax), right, y, { align: 'right' })

  y += 3
  doc.setDrawColor(26, 26, 26)
  doc.line(right - 55, y, right, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  // Label weiter links ansetzen — „Gesamtbetrag (brutto)" ist breiter als die
  // Netto-/USt-Labels und würde sonst in den Betrag laufen.
  doc.text('Gesamtbetrag (brutto)', right - 72, y)
  doc.text(eur(data.total), right, y, { align: 'right' })

  // Zahlungsziel.
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  const dueText = data.dueDate
    ? `${ZAHLUNGSZIEL_HINWEIS} Fällig am ${deDate(data.dueDate)}.`
    : ZAHLUNGSZIEL_HINWEIS
  doc.text(dueText, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })

  if (data.notes) {
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 115, 108)
    doc.text(data.notes, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
  }

  drawFooter(doc)
  return doc.output('blob')
}

/** Daten für die Lieferschein-PDF. */
export interface DeliveryNotePdfData {
  number: string
  date: string
  dealer: Dealerish
  seasonLabel: string | null
  items: BelegItem[]
  notes: string | null
}

/** Lieferschein als PDF-Blob erzeugen (gleicher Aufbau, ohne Preise). */
export function buildDeliveryNotePdf(data: DeliveryNotePdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const meta = data.seasonLabel
    ? [{ label: 'Saison', value: data.seasonLabel }]
    : []
  const headerBottom = drawHeader(doc, {
    title: 'Lieferschein',
    number: data.number,
    date: data.date,
    dealer: data.dealer,
    meta,
  })

  let y = drawItemsTable(doc, data.items, headerBottom, false)

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0)
  const right = PAGE_W - MARGIN
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(26, 26, 26)
  doc.text('Gesamtmenge', right - 42, y)
  doc.text(String(totalQty), right, y, { align: 'right' })

  if (data.notes) {
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 115, 108)
    doc.text(data.notes, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
  }

  drawFooter(doc)
  return doc.output('blob')
}
