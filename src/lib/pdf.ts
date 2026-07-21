import { jsPDF } from 'jspdf'
import { type Dealerish } from '../types/invoice'
import type { InvoicePdfLabels, DeliveryNotePdfLabels } from './pdfLabels'
import {
  BRAND_LOGO_BLACK,
  BRAND_LOGO_BLACK_W,
  BRAND_LOGO_BLACK_H,
} from './brandLogo'

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

/** Ganzzahl mit Tausenderpunkt (de-DE) fürs PDF — wie die Bildschirm-Tabellen. */
function num(value: number): string {
  return value.toLocaleString('de-DE')
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
  /** Dokumenttitel, z. B. „Rechnung" oder „Lieferschein" (lokalisiert). */
  title: string
  /** Belegnummer (YYYY-0001 bzw. LS-YYYY-0001). */
  number: string
  date: string
  dealer: Dealerish
  /** Empfänger-Überschrift (lokalisiert), z. B. „Rechnungsempfänger"/„Empfänger". */
  recipientLabel: string
  /** Label der Nummern-Zeile rechts (lokalisiert), z. B. „Nr."/„No.". */
  numberLabel: string
  /** Label der Datums-Zeile rechts (lokalisiert), z. B. „Datum"/„Date". */
  dateLabel: string
  /** Zusätzliche Kopfzeilen rechts (z. B. Fällig am, Saison) — Labels lokalisiert. */
  meta?: { label: string; value: string }[]
}

/** Spaltenköpfe der Positionstabelle (lokalisiert). Preis-Spalten nur mit Preisen. */
interface ItemsTableLabels {
  article: string
  color: string
  size: string
  quantity: string
  unitPrice: string
  sum: string
}

const MARGIN = 18
const PAGE_W = 210 // A4 hoch, mm

/**
 * Markenakzent Dunkelgrün (#2B3A2D = RGB 43,58,45). BEWUSST nur für feine
 * Trennlinien — keine flächigen Hintergründe, damit die Belege druck-/
 * scantauglich bleiben (Text bleibt schwarz auf weiß).
 */
const ACCENT: readonly [number, number, number] = [43, 58, 45]
/** Standard-Linienstärke von jsPDF (mm) – zum Zurücksetzen nach Akzentlinien. */
const DEFAULT_LINE_WIDTH = 0.2

/**
 * WARM-ME-Logo (schwarz, mit Tagline) oben links im Beleg — ersetzt den früheren
 * Text-Schriftzug. Aspektkorrekt skaliert (Höhe fix, Breite abgeleitet). Bei
 * Einbettungsfehler Fallback auf den Text-Schriftzug, damit ein Beleg NIE bricht.
 */
function drawSenderLogo(doc: jsPDF) {
  const height = 9
  const width = (height * BRAND_LOGO_BLACK_W) / BRAND_LOGO_BLACK_H
  try {
    doc.addImage(BRAND_LOGO_BLACK, 'PNG', MARGIN, 13, width, height)
  } catch {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(26, 26, 26)
    doc.text(SENDER.name.toUpperCase(), MARGIN, 22, { charSpace: 1.5 })
  }
}

/** Kopf (Absender, Empfänger, Titel, Belegdaten) rendern, Y-Cursor zurück. */
function drawHeader(doc: jsPDF, h: BelegHeader): number {
  // Absender.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 26, 26)
  drawSenderLogo(doc)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 115, 108)
  SENDER.lines.forEach((line, i) => doc.text(line, MARGIN, 28 + i * 4.5))

  // Empfänger (Händler).
  doc.setTextColor(120, 115, 108)
  doc.setFontSize(8)
  doc.text(h.recipientLabel, MARGIN, 48)

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
    { label: h.numberLabel, value: h.number },
    { label: h.dateLabel, value: deDate(h.date) },
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

  // Dezente dunkelgrüne Akzentlinie unter dem Kopf, direkt über der
  // Positionstabelle (markenkonform, aber druckfest — nur eine feine Linie).
  const bottom = Math.max(ry, 74)
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, bottom, PAGE_W - MARGIN, bottom)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)

  return bottom
}

/** Positionstabelle rendern (Preisspalten optional), Y-Cursor zurück. */
function drawItemsTable(
  doc: jsPDF,
  items: BelegItem[],
  startY: number,
  withPrices: boolean,
  labels: ItemsTableLabels,
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
  doc.text(labels.article, cols.desc + 1, y)
  doc.text(labels.color, cols.color, y)
  doc.text(labels.size, cols.size, y)
  if (withPrices) {
    doc.text(labels.quantity, cols.qty!, y, { align: 'right' })
    doc.text(labels.unitPrice, cols.unit!, y, { align: 'right' })
    doc.text(labels.sum, cols.total!, y, { align: 'right' })
  } else {
    doc.text(labels.quantity, cols.qty as number, y, { align: 'right' })
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
  // Feine dunkelgrüne Akzentlinie über der Fußzeile (zweite und letzte Linie).
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, 283, PAGE_W - MARGIN, 283)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)

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
  /** Bereits in der Kundensprache aufgelöste Beleg-Labels (de-Fallback). */
  labels: InvoicePdfLabels
  number: string
  date: string
  dueDate: string | null
  dealer: Dealerish
  items: BelegItem[]
  /** Nettobetrag (Summe der Positionen ohne USt). */
  subtotal: number
  /** Ausgewiesene Umsatzsteuer (Betrag, aus dem eingefrorenen tax_amount). */
  tax: number
  /**
   * Steuersatz als FAKTOR aus dem eingefrorenen invoices.tax_rate (0.20 = 20 %).
   * Das USt-Label kommt aus DIESEM Wert, NICHT aus der Konstante VAT_RATE_PERCENT —
   * so zeigt jeder Beleg seinen eigenen, zum Erzeugungszeitpunkt eingefrorenen Satz.
   */
  taxRate: number
  /** Bruttobetrag (Netto + USt). */
  total: number
  /**
   * Optionaler Pflichthinweis (Reverse Charge / Ausfuhr), eingefroren aus
   * invoices.tax_note. null/leer → keine Hinweiszeile (Altbelege, Inland).
   */
  taxNote?: string | null
  /** Zahlungsziel in Tagen (für die Beleg-Zeile „…innerhalb von N Tagen netto"). */
  zahlungszielTage: number
  /**
   * Optionaler Skonto-Hinweis. null / prozent 0 → keine Skonto-Zeile.
   * Der Rechnungsbetrag bleibt Brutto; Skonto ist nur ein bedingter Nachlass.
   */
  skonto?: {
    prozent: number
    /** Skonto-Frist als ISO-Datum (Rechnungsdatum + skonto_tage). */
    date: string
    /** Skonto-Abzug in EUR. */
    amount: number
    /** Zahlbetrag bei Skonto (Brutto − Skonto) in EUR. */
    payable: number
  } | null
  notes: string | null
}

/** Rechnung als PDF-Blob erzeugen (mit Preisen und Steuerausweisung Netto/USt/Brutto). */
export function buildInvoicePdf(data: InvoicePdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = data.labels

  const meta = data.dueDate
    ? [{ label: L.dueDate, value: deDate(data.dueDate) }]
    : []
  const headerBottom = drawHeader(doc, {
    title: L.title,
    number: data.number,
    date: data.date,
    dealer: data.dealer,
    recipientLabel: L.recipient,
    numberLabel: L.number,
    dateLabel: L.date,
    meta,
  })

  let y = drawItemsTable(doc, data.items, headerBottom, true, {
    article: L.colArticle,
    color: L.colColor,
    size: L.colSize,
    quantity: L.colQty,
    unitPrice: L.colUnit,
    sum: L.colSum,
  })

  // Summen (rechtsbündig).
  const right = PAGE_W - MARGIN
  y += 2
  doc.setFontSize(9.5)
  doc.setTextColor(90, 85, 80)
  doc.text(L.subtotal, right - 42, y)
  doc.setTextColor(26, 26, 26)
  doc.text(eur(data.subtotal), right, y, { align: 'right' })

  y += 5
  doc.setTextColor(90, 85, 80)
  // Satz aus dem eingefrorenen tax_rate des Belegs (Faktor → Prozent). Altbelege
  // mit tax_rate = 0.20 ergeben exakt „USt (20 %)" wie bisher.
  doc.text(`${L.vat} (${Math.round(data.taxRate * 100)} %)`, right - 42, y)
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
  doc.text(L.gross, right - 72, y)
  doc.text(eur(data.total), right, y, { align: 'right' })

  // Zahlungsziel. Zahlen/Datum unverändert de-DE/EUR — die Sprache betrifft nur
  // den Satzbau (payableWithin), nicht die Formatierung.
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  const dueText = L.payableWithin(
    data.zahlungszielTage,
    data.dueDate ? deDate(data.dueDate) : null,
  )
  doc.text(dueText, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })

  // Skonto als bedingter Nachlass (Rechnungsbetrag bleibt unverändert).
  if (data.skonto && data.skonto.prozent > 0) {
    y += 6
    const s = data.skonto
    const pct = s.prozent.toLocaleString('de-DE', { maximumFractionDigits: 2 })
    doc.setTextColor(90, 85, 80)
    doc.text(
      L.skontoLine(deDate(s.date), pct, eur(s.amount), eur(s.payable)),
      MARGIN,
      y,
      { maxWidth: PAGE_W - MARGIN * 2 },
    )
    doc.setTextColor(26, 26, 26)
  }

  // Pflichthinweis (Reverse Charge / Ausfuhr) — nur wenn eingefroren vorhanden.
  // Altbelege haben tax_note = null → keine Zeile, Layout unverändert.
  if (data.taxNote && data.taxNote.trim()) {
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 26, 26)
    doc.text(data.taxNote.trim(), MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
  }

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

// ─── Kommissionierschein (intern, Lager) ─────────────────────────────────────

/**
 * Eine Position auf einer Kunden-Seite des Kommissionierscheins.
 *
 * ACHTUNG zur Datenhöhe: `ordered` und `pick` sind KUNDENGRÖSSEN (was dieser
 * Kunde bestellt hat bzw. für ihn zu kommissionieren ist). `received` ist dagegen
 * die GESAMT-Eingangsmenge dieser Position über den ganzen Wareneingang (ein
 * Pool, nicht je Kunde) — deshalb auf dem Beleg als „Eingang (ges.)" ausgewiesen.
 */
export interface PickingItem {
  productName: string
  color: string | null
  size: string | null
  /** Zu kommissionieren = an diesen Kunden verteilte Menge. */
  pick: number
  /** Von diesem Kunden bestellt. */
  ordered: number
  /** Gesamt eingegangen je Position (Pool über alle Kunden). */
  received: number
}

/** Ein Kunde (= eine Lieferung) mit seinen zu kommissionierenden Positionen. */
export interface PickingCustomer {
  dealerName: string
  /** Ort/Land, klein unter dem Namen. */
  place: string | null
  items: PickingItem[]
}

/** Eine Zeile der Abgleich-Zusammenfassung (Deckblatt), über alle Kunden. */
export interface PickingSummaryRow {
  /** „Produkt · Farbe · Größe". */
  label: string
  ordered: number
  received: number
  distributed: number
}

/** Daten für den Kommissionierschein (Sammeldokument je Produktionsbestellung). */
export interface PickingListPdfData {
  seasonLabel: string | null
  /** Erzeugungsdatum als ISO (nur Anzeige, nicht persistiert). */
  date: string
  /** Abgleich Wareneingang ↔ Verteilung über alle Kunden (Deckblatt). */
  summary: PickingSummaryRow[]
  /** Je Kunde eine Seite. */
  customers: PickingCustomer[]
}

/**
 * Kopf des (internen) Kommissionierscheins. Kein „Rechnungsempfänger"-Block wie
 * bei Kundenbelegen: links steht je nach Seite entweder „Zusammenfassung" oder
 * der Kunde. Gibt den Y-Cursor unter der Akzentlinie zurück.
 */
function drawPickingHeader(
  doc: jsPDF,
  left: { kind: 'summary' } | { kind: 'customer'; name: string; place: string | null },
  meta: { label: string; value: string }[],
): number {
  // Absender.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 26, 26)
  drawSenderLogo(doc)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 115, 108)
  SENDER.lines.forEach((line, i) => doc.text(line, MARGIN, 28 + i * 4.5))

  // Titel + Meta (rechtsbündig).
  const right = PAGE_W - MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(26, 26, 26)
  doc.text('Kommissionierschein', right, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let my = 30
  for (const row of meta) {
    doc.setTextColor(120, 115, 108)
    doc.text(row.label, right - 42, my)
    doc.setTextColor(26, 26, 26)
    doc.text(row.value, right, my, { align: 'right' })
    my += 5
  }

  // Linker Block: Zusammenfassung (Deckblatt) oder Kunde (Kunden-Seite).
  let ry = 48
  if (left.kind === 'summary') {
    doc.setTextColor(120, 115, 108)
    doc.setFontSize(8)
    doc.text('Deckblatt', MARGIN, ry)
    ry += 6
    doc.setTextColor(26, 26, 26)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    // Kein Unicode-Pfeil — die Standard-Schrift (WinAnsi) kann ihn nicht.
    doc.text('Abgleich Wareneingang / Verteilung', MARGIN, ry)
    ry += 4.5
  } else {
    doc.setTextColor(120, 115, 108)
    doc.setFontSize(8)
    doc.text('Kunde', MARGIN, ry)
    ry += 6
    doc.setTextColor(26, 26, 26)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(left.name, MARGIN, ry)
    ry += 5
    if (left.place) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(90, 85, 80)
      doc.text(left.place, MARGIN, ry)
      ry += 4.5
    }
  }

  // Dezente dunkelgrüne Akzentlinie unter dem Kopf (wie Rechnung/Lieferschein).
  const bottom = Math.max(ry, 56)
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, bottom, PAGE_W - MARGIN, bottom)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)
  return bottom
}

/** Deckblatt-Tabelle: Abgleich bestellt → eingegangen → verteilt → Rest. */
function drawPickingSummaryTable(
  doc: jsPDF,
  rows: PickingSummaryRow[],
  startY: number,
): number {
  const right = PAGE_W - MARGIN
  const cols = { pos: MARGIN, ordered: 116, received: 143, distributed: 168, rest: right }

  let y = startY + 10
  const drawHead = () => {
    doc.setFillColor(241, 239, 234)
    doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 85, 80)
    doc.text('Position', cols.pos + 1, y)
    doc.text('Bestellt', cols.ordered, y, { align: 'right' })
    doc.text('Eingegangen', cols.received, y, { align: 'right' })
    doc.text('Verteilt', cols.distributed, y, { align: 'right' })
    doc.text('Rest', cols.rest, y, { align: 'right' })
    y += 4
  }
  drawHead()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let tOrd = 0
  let tRec = 0
  let tDist = 0
  for (const r of rows) {
    y += 6
    if (y > 262) {
      doc.addPage()
      y = 26
      drawHead()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
    }
    const rest = r.received - r.distributed
    tOrd += r.ordered
    tRec += r.received
    tDist += r.distributed
    doc.setTextColor(26, 26, 26)
    doc.text(r.label, cols.pos + 1, y, { maxWidth: 90 })
    doc.setTextColor(90, 85, 80)
    doc.text(num(r.ordered), cols.ordered, y, { align: 'right' })
    doc.setTextColor(26, 26, 26)
    doc.text(num(r.received), cols.received, y, { align: 'right' })
    doc.text(num(r.distributed), cols.distributed, y, { align: 'right' })
    // Rest < 0 (mehr verteilt als eingegangen) rot markieren — wie am Bildschirm.
    if (rest < 0) doc.setTextColor(176, 0, 32)
    else doc.setTextColor(90, 85, 80)
    doc.text(`${rest > 0 ? '+' : ''}${num(rest)}`, cols.rest, y, { align: 'right' })
    doc.setTextColor(26, 26, 26)
    doc.setDrawColor(230, 227, 222)
    doc.line(MARGIN, y + 2.5, right, y + 2.5)
  }

  // Summen-Zeile.
  y += 8
  doc.setFillColor(241, 239, 234)
  doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  doc.text('Gesamt', cols.pos + 1, y)
  doc.text(num(tOrd), cols.ordered, y, { align: 'right' })
  doc.text(num(tRec), cols.received, y, { align: 'right' })
  doc.text(num(tDist), cols.distributed, y, { align: 'right' })
  const totRest = tRec - tDist
  if (totRest < 0) doc.setTextColor(176, 0, 32)
  else doc.setTextColor(26, 26, 26)
  doc.text(`${totRest > 0 ? '+' : ''}${num(totRest)}`, cols.rest, y, { align: 'right' })
  doc.setTextColor(26, 26, 26)
  return y + 8
}

/** Kunden-Tabelle: Positionen zum Kommissionieren mit Abhak-Kästchen. */
function drawPickingCustomerTable(
  doc: jsPDF,
  items: PickingItem[],
  startY: number,
): number {
  const right = PAGE_W - MARGIN
  const cols = {
    art: MARGIN,
    color: 62,
    size: 84,
    ordered: 112,
    received: 138,
    pick: 165,
    check: 178,
  }

  // Legende: klärt, dass „Eingang" die Gesamt-Poolmenge ist, nicht je Kunde.
  let y = startY + 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(120, 115, 108)
  doc.text(
    'Bestellt = von diesem Kunden bestellt · Eingang (ges.) = gesamt eingegangen je Position (nicht je Kunde) · Komm. = zu kommissionieren',
    MARGIN,
    y,
    { maxWidth: PAGE_W - MARGIN * 2 },
  )
  y += 8

  const drawHead = () => {
    doc.setFillColor(241, 239, 234)
    doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 85, 80)
    doc.text('Artikel', cols.art + 1, y)
    doc.text('Farbe', cols.color, y)
    doc.text('Größe', cols.size, y)
    doc.text('Bestellt', cols.ordered, y, { align: 'right' })
    doc.text('Eingang (ges.)', cols.received, y, { align: 'right' })
    doc.text('Komm.', cols.pick, y, { align: 'right' })
    // Kein Unicode-Häkchen (WinAnsi) — schlichtes Kürzel über dem Abhak-Kästchen.
    doc.text('Erl.', cols.check, y, { align: 'center' })
    y += 4
  }
  drawHead()

  doc.setFontSize(9)
  let tOrd = 0
  let tPick = 0
  for (const it of items) {
    y += 7
    if (y > 262) {
      doc.addPage()
      y = 26
      drawHead()
      y += 3
    }
    tOrd += it.ordered
    tPick += it.pick
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(26, 26, 26)
    doc.text(String(it.productName), cols.art + 1, y, { maxWidth: 42 })
    doc.setTextColor(90, 85, 80)
    doc.text(it.color ?? '—', cols.color, y)
    doc.text(it.size ?? '—', cols.size, y)
    doc.text(num(it.ordered), cols.ordered, y, { align: 'right' })
    doc.text(num(it.received), cols.received, y, { align: 'right' })
    // Kommissioniermenge fett — das ist die eigentliche Handlungszahl.
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 26, 26)
    doc.text(num(it.pick), cols.pick, y, { align: 'right' })
    // Abhak-Kästchen.
    doc.setDrawColor(120, 115, 108)
    doc.setLineWidth(0.3)
    doc.rect(cols.check - 2, y - 3, 4, 4)
    doc.setLineWidth(DEFAULT_LINE_WIDTH)
    doc.setDrawColor(230, 227, 222)
    doc.line(MARGIN, y + 3, right, y + 3)
  }

  // Summen-Zeile.
  y += 9
  doc.setFillColor(241, 239, 234)
  doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  doc.text('Gesamt', cols.art + 1, y)
  doc.text(num(tOrd), cols.ordered, y, { align: 'right' })
  doc.text(num(tPick), cols.pick, y, { align: 'right' })
  return y + 8
}

/**
 * Kommissionierschein als PDF-Blob (internes Lagerdokument, nicht persistiert):
 * Deckblatt mit dem Abgleich über alle Kunden, danach je Kunde eine Seite mit den
 * zu kommissionierenden Positionen und Abhak-Kästchen. Deutsch, Stil wie
 * Rechnung/Lieferschein (dunkelgrüne Akzentlinien).
 */
export function buildPickingListPdf(data: PickingListPdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const seasonMeta = data.seasonLabel
    ? [{ label: 'Saison', value: data.seasonLabel }]
    : []

  // Deckblatt: Abgleich-Zusammenfassung.
  const summaryBottom = drawPickingHeader(doc, { kind: 'summary' }, [
    ...seasonMeta,
    { label: 'Datum', value: deDate(data.date) },
    { label: 'Kunden', value: num(data.customers.length) },
  ])
  drawPickingSummaryTable(doc, data.summary, summaryBottom)
  drawFooter(doc)

  // Je Kunde eine Seite.
  for (const c of data.customers) {
    doc.addPage()
    const bottom = drawPickingHeader(
      doc,
      { kind: 'customer', name: c.dealerName, place: c.place },
      [...seasonMeta, { label: 'Datum', value: deDate(data.date) }],
    )
    drawPickingCustomerTable(doc, c.items, bottom)
    drawFooter(doc)
  }

  return doc.output('blob')
}

/** Eine Zeile der Kunden-Lagerliste (je Artikel + Farbe). */
export interface StockListRow {
  article: string
  color: string | null
  /** Bestand (Summe über Größe + Variante). */
  pieces: number
  /** Großhandelspreis (VK-GH), oder null. */
  wholesalePrice: number | null
  /** Muster-Foto als dataURL (Swatch/Produktfoto), oder null. */
  photo: string | null
}

/** Daten für die Kunden-Lagerliste (Bestandslager). Wegwerf-Dokument. */
export interface StockListPdfData {
  /** Erzeugungsdatum als ISO (nur Anzeige, nicht persistiert). */
  date: string
  rows: StockListRow[]
  totalPieces: number
}

/** Kopf der Lagerliste (kein Empfänger-Block — Kundenliste aus dem Bestand). */
function drawStockListHeader(
  doc: jsPDF,
  meta: { label: string; value: string }[],
): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 26, 26)
  drawSenderLogo(doc)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 115, 108)
  SENDER.lines.forEach((line, i) => doc.text(line, MARGIN, 28 + i * 4.5))

  const right = PAGE_W - MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(26, 26, 26)
  doc.text('Lagerliste', right, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let my = 30
  for (const row of meta) {
    doc.setTextColor(120, 115, 108)
    doc.text(row.label, right - 42, my)
    doc.setTextColor(26, 26, 26)
    doc.text(row.value, right, my, { align: 'right' })
    my += 5
  }

  let ry = 48
  doc.setTextColor(120, 115, 108)
  doc.setFontSize(8)
  doc.text('Bestand', MARGIN, ry)
  ry += 6
  doc.setTextColor(26, 26, 26)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Bestandslager', MARGIN, ry)
  ry += 4.5

  const bottom = Math.max(ry, 56)
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, bottom, PAGE_W - MARGIN, bottom)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)
  return bottom
}

/** Lagerlisten-Tabelle: Muster-Foto · Artikel · Farbe · Stück · VK-GH + Gesamt. */
function drawStockListTable(
  doc: jsPDF,
  rows: StockListRow[],
  total: number,
  startY: number,
) {
  const right = PAGE_W - MARGIN
  const cols = { photo: MARGIN, article: 36, color: 96, pieces: 150, price: right }
  const ROW_H = 16

  let y = startY + 8
  const drawHead = () => {
    doc.setFillColor(241, 239, 234)
    doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 85, 80)
    doc.text('Foto', cols.photo + 1, y)
    doc.text('Artikel', cols.article, y)
    doc.text('Farbe', cols.color, y)
    doc.text('Stueck', cols.pieces, y, { align: 'right' })
    doc.text('VK-GH', cols.price, y, { align: 'right' })
    y += 4
  }
  drawHead()

  for (const r of rows) {
    if (y + ROW_H > 270) {
      doc.addPage()
      y = 26
      drawHead()
    }
    const rowTop = y + 2
    // Muster-Foto — pro Bild abgesichert: ein defektes Bild überspringt nur die
    // Zelle, das PDF baut weiter (dataURL kommt bereits aufgelöst aus stockList.ts).
    if (r.photo) {
      try {
        doc.addImage(r.photo, 'JPEG', cols.photo, rowTop, 14, 14)
      } catch {
        /* Bild überspringen, kein Abbruch */
      }
    }
    const textY = rowTop + 9
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 26, 26)
    doc.text(doc.splitTextToSize(r.article, cols.color - cols.article - 3)[0] ?? '', cols.article, textY)
    doc.setTextColor(90, 85, 80)
    doc.text(r.color ?? '-', cols.color, textY)
    doc.setTextColor(26, 26, 26)
    doc.text(num(r.pieces), cols.pieces, textY, { align: 'right' })
    doc.text(r.wholesalePrice != null ? eur(r.wholesalePrice) : '-', cols.price, textY, {
      align: 'right',
    })

    doc.setDrawColor(220, 216, 210)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, rowTop + ROW_H - 1, PAGE_W - MARGIN, rowTop + ROW_H - 1)
    doc.setLineWidth(DEFAULT_LINE_WIDTH)
    y += ROW_H
  }

  if (y + 12 > 278) {
    doc.addPage()
    y = 26
  }
  y += 4
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(26, 26, 26)
  doc.text('Gesamtbestand', cols.article, y)
  doc.text(num(total), cols.pieces, y, { align: 'right' })
}

/**
 * Kunden-Lagerliste als PDF-Blob (Bestandslager). Wegwerf-Dokument wie der
 * Kommissionierschein — kein Nummernkreis, keine Persistenz. Fotos sind bereits
 * als dataURL vorbereitet (stockList.ts); der Builder platziert sie nur.
 */
export function buildStockListPdf(data: StockListPdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const bottom = drawStockListHeader(doc, [
    { label: 'Datum', value: deDate(data.date) },
    { label: 'Artikel', value: num(data.rows.length) },
  ])
  drawStockListTable(doc, data.rows, data.totalPieces, bottom)
  drawFooter(doc)
  return doc.output('blob')
}

// ─── Auftragsbestätigung (AB) ────────────────────────────────────────────────
//
// Wegwerf-Beleg wie Lagerliste/Kommissionierschein: kein Nummernkreis (die
// order_number ist bereits persistent), keine Storage-Ablage. Die MwSt ist reine
// VORSCHAU (taxCalc lesend, im Daten-Builder) — der AB friert KEINE Steuer ein.
// Zweisprachig: alle Beleg-Strings kommen als bereits übersetzte `labels`/`head`
// in der Kundensprache herein (pdf.ts bleibt Layout-only); der Pflichthinweis ist
// bilingual aus taxCalc. Fotos sind als dataURL vorbereitet (skip-bei-Fehler).

/** Beleg-Labels der AB in der Kundensprache (im Daten-Builder aufgelöst). */
export interface OrderConfirmationLabels {
  title: string
  recipient: string
  number: string
  date: string
  orderType: string
  shipMethod: string
  deliveryPeriod: string
  colPhoto: string
  colArticle: string
  colColor: string
  colSize: string
  colQty: string
  colUnit: string
  colSum: string
  totalPieces: string
  subtotal: string
  /** USt-/VAT-Label; der Satz wird als „(X %)" angehängt. */
  vat: string
  gross: string
  taxHint: string
  taxUncertain: string
  /** Überschrift des Zahlungsbedingungs-Blocks. */
  paymentTerms: string
}

/** Aufgelöste (bereits lokalisierte) Kopfdaten-Werte der AB. */
export interface OrderConfirmationHead {
  orderType: string | null
  shipMethod: string | null
  /** ISO-Datum, im Builder als TT.MM.JJJJ formatiert. */
  deliveryFrom: string | null
  deliveryTo: string | null
}

/** Eine AB-Position inkl. vorbereitetem Foto (dataURL) oder null. */
export interface OrderConfirmationItem {
  photo: string | null
  description: string
  color: string | null
  size: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

/** MwSt-Vorschau der AB: entweder unsicher (nur Hinweis) oder konkret. */
export type OrderConfirmationTax =
  | { uncertain: true }
  | { uncertain: false; rate: number; vat: number; gross: number; note: string | null }

export interface OrderConfirmationPdfData {
  number: string
  date: string
  dealer: Dealerish
  labels: OrderConfirmationLabels
  head: OrderConfirmationHead
  items: OrderConfirmationItem[]
  totalPieces: number
  /** Nettosumme (= Gesamtsumme der Positionen). */
  subtotal: number
  tax: OrderConfirmationTax
  /**
   * Fertiger Zahlungsbedingungs-Text in der Kundensprache (aus buildPaymentTermsText,
   * je Order editierbar). Kann mehrzeilig sein (Freitext als eigene Zeile).
   */
  paymentTermsText: string
}

/** AB-Positionstabelle: Foto · Artikel · Farbe · Größe · Menge · Einzelpreis · Summe. */
function drawOrderItemsTable(
  doc: jsPDF,
  data: OrderConfirmationPdfData,
  startY: number,
): number {
  const L = data.labels
  const right = PAGE_W - MARGIN
  const cols = {
    photo: MARGIN,
    article: 36,
    color: 92,
    size: 118,
    qty: 140,
    unit: 168,
    sum: right,
  }
  const ROW_H = 16

  let y = startY + 8
  const drawHead = () => {
    doc.setFillColor(241, 239, 234)
    doc.rect(MARGIN, y - 5, PAGE_W - MARGIN * 2, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 85, 80)
    doc.text(L.colPhoto, cols.photo + 1, y)
    doc.text(L.colArticle, cols.article, y)
    doc.text(L.colColor, cols.color, y)
    doc.text(L.colSize, cols.size, y)
    doc.text(L.colQty, cols.qty, y, { align: 'right' })
    doc.text(L.colUnit, cols.unit, y, { align: 'right' })
    doc.text(L.colSum, cols.sum, y, { align: 'right' })
    y += 4
  }
  drawHead()

  for (const it of data.items) {
    if (y + ROW_H > 262) {
      doc.addPage()
      y = 26
      drawHead()
    }
    const rowTop = y + 2
    // Foto pro Bild abgesichert — ein defektes Bild überspringt nur die Zelle.
    if (it.photo) {
      try {
        doc.addImage(it.photo, 'JPEG', cols.photo, rowTop, 14, 14)
      } catch {
        /* Bild überspringen, kein Abbruch */
      }
    }
    const textY = rowTop + 9
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 26, 26)
    doc.text(
      doc.splitTextToSize(it.description, cols.color - cols.article - 3)[0] ?? '',
      cols.article,
      textY,
    )
    doc.setTextColor(90, 85, 80)
    doc.text(it.color ?? '—', cols.color, textY)
    doc.text(it.size ?? '—', cols.size, textY)
    doc.setTextColor(26, 26, 26)
    doc.text(num(it.quantity), cols.qty, textY, { align: 'right' })
    doc.text(eur(it.unitPrice), cols.unit, textY, { align: 'right' })
    doc.text(eur(it.lineTotal), cols.sum, textY, { align: 'right' })

    doc.setDrawColor(220, 216, 210)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, rowTop + ROW_H - 1, PAGE_W - MARGIN, rowTop + ROW_H - 1)
    doc.setLineWidth(DEFAULT_LINE_WIDTH)
    y += ROW_H
  }
  return y + 4
}

/**
 * Auftragsbestätigung als PDF-Blob. Wegwerf-Dokument (kein Nummernkreis/Storage);
 * die order_number ist bereits persistent. MwSt = Vorschau (im Builder nur
 * gezeichnet, nicht berechnet/eingefroren). Zweisprachig über `labels`/`head`.
 */
export function buildOrderConfirmationPdf(data: OrderConfirmationPdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = data.labels
  const right = PAGE_W - MARGIN

  // ── Kopf (Absender) ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 26, 26)
  drawSenderLogo(doc)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 115, 108)
  SENDER.lines.forEach((line, i) => doc.text(line, MARGIN, 28 + i * 4.5))

  // Empfänger.
  doc.setTextColor(120, 115, 108)
  doc.setFontSize(8)
  doc.text(L.recipient, MARGIN, 48)
  doc.setTextColor(26, 26, 26)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(data.dealer.name, MARGIN, 54)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 85, 80)
  let ry = 59.5
  if (data.dealer.contact_name) {
    doc.text(data.dealer.contact_name, MARGIN, ry)
    ry += 4.5
  }
  const place = [data.dealer.city, data.dealer.country].filter(Boolean).join(', ')
  if (place) {
    doc.text(place, MARGIN, ry)
    ry += 4.5
  }
  if (data.dealer.email) {
    doc.text(data.dealer.email, MARGIN, ry)
    ry += 4.5
  }

  // Titel + Belegdaten (rechtsbündig).
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(26, 26, 26)
  doc.text(L.title, right, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let my = 30
  for (const row of [
    { label: L.number, value: data.number },
    { label: L.date, value: deDate(data.date) },
  ]) {
    doc.setTextColor(120, 115, 108)
    doc.text(row.label, right - 42, my)
    doc.setTextColor(26, 26, 26)
    doc.text(row.value, right, my, { align: 'right' })
    my += 5
  }

  // ── Kopfdaten-Zeilen (Order-Art, Versandart, Liefertermin) ──
  let hy = Math.max(ry, 74)
  doc.setFontSize(9)
  const headLines: string[] = []
  if (data.head.orderType) headLines.push(`${L.orderType}: ${data.head.orderType}`)
  if (data.head.shipMethod) headLines.push(`${L.shipMethod}: ${data.head.shipMethod}`)
  if (data.head.deliveryFrom || data.head.deliveryTo) {
    const from = data.head.deliveryFrom ? deDate(data.head.deliveryFrom) : '—'
    const to = data.head.deliveryTo ? deDate(data.head.deliveryTo) : '—'
    headLines.push(`${L.deliveryPeriod}: ${from} – ${to}`)
  }
  if (headLines.length > 0) {
    doc.setTextColor(90, 85, 80)
    doc.text(headLines.join('   ·   '), MARGIN, hy, { maxWidth: PAGE_W - MARGIN * 2 })
    hy += 4
  }

  // Akzentlinie über der Positionstabelle.
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, hy, PAGE_W - MARGIN, hy)
  doc.setLineWidth(DEFAULT_LINE_WIDTH)

  // ── Positionen ──
  let y = drawOrderItemsTable(doc, data, hy)

  if (y + 40 > 278) {
    doc.addPage()
    y = 26
  }

  // ── Summen: Gesamt-Stück + Netto/USt/Brutto (Vorschau) ──
  y += 4
  doc.setFontSize(9.5)
  doc.setTextColor(90, 85, 80)
  doc.text(L.totalPieces, right - 42, y)
  doc.setTextColor(26, 26, 26)
  doc.text(num(data.totalPieces), right, y, { align: 'right' })

  y += 5
  doc.setTextColor(90, 85, 80)
  doc.text(L.subtotal, right - 42, y)
  doc.setTextColor(26, 26, 26)
  doc.text(eur(data.subtotal), right, y, { align: 'right' })

  if (data.tax.uncertain) {
    y += 6
    doc.setTextColor(120, 115, 108)
    doc.setFontSize(8.5)
    doc.text(L.taxUncertain, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
  } else {
    y += 5
    doc.setTextColor(90, 85, 80)
    doc.setFontSize(9.5)
    doc.text(`${L.vat} (${Math.round(data.tax.rate * 100)} %)`, right - 42, y)
    doc.setTextColor(26, 26, 26)
    doc.text(eur(data.tax.vat), right, y, { align: 'right' })

    y += 3
    doc.setDrawColor(26, 26, 26)
    doc.line(right - 55, y, right, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(L.gross, right - 72, y)
    doc.text(eur(data.tax.gross), right, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    if (data.tax.note) {
      y += 8
      doc.setFontSize(9)
      doc.setTextColor(26, 26, 26)
      doc.text(data.tax.note, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
    }
    // Vorschau-Hinweis (AB ist kein Steuerbeleg).
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120, 115, 108)
    doc.text(L.taxHint, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })
  }

  // ── Zahlungsbedingungen (je Order/AB, immer mind. der Zahlungsziel-Satz) ──
  y += 10
  if (y > 268) {
    doc.addPage()
    y = 26
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(120, 115, 108)
  doc.text(L.paymentTerms, MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  // splitTextToSize bricht lange Zeilen um UND respektiert die „\n" der Freitext-Zeile.
  const ptLines = doc.splitTextToSize(data.paymentTermsText, PAGE_W - MARGIN * 2)
  doc.text(ptLines, MARGIN, y)

  drawFooter(doc)
  return doc.output('blob')
}

/** Daten für die Lieferschein-PDF. */
export interface DeliveryNotePdfData {
  /** Bereits in der Kundensprache aufgelöste Beleg-Labels (de-Fallback). */
  labels: DeliveryNotePdfLabels
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
  const L = data.labels

  const meta = data.seasonLabel
    ? [{ label: L.season, value: data.seasonLabel }]
    : []
  const headerBottom = drawHeader(doc, {
    title: L.title,
    number: data.number,
    date: data.date,
    dealer: data.dealer,
    recipientLabel: L.recipient,
    numberLabel: L.number,
    dateLabel: L.date,
    meta,
  })

  // Ohne Preise → unitPrice/sum werden nicht gezeichnet; leere Labels genügen.
  let y = drawItemsTable(doc, data.items, headerBottom, false, {
    article: L.colArticle,
    color: L.colColor,
    size: L.colSize,
    quantity: L.colQty,
    unitPrice: '',
    sum: '',
  })

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0)
  const right = PAGE_W - MARGIN
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(26, 26, 26)
  doc.text(L.totalQuantity, right - 42, y)
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
