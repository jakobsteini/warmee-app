import { jsPDF } from 'jspdf'
import { type Dealerish } from '../types/invoice'
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

/**
 * Markenakzent Dunkelgrün (#2B3A2D = RGB 43,58,45). BEWUSST nur für feine
 * Trennlinien — keine flächigen Hintergründe, damit die Belege druck-/
 * scantauglich bleiben (Text bleibt schwarz auf weiß).
 */
const ACCENT: readonly [number, number, number] = [43, 58, 45]
/** Standard-Linienstärke von jsPDF (mm) – zum Zurücksetzen nach Akzentlinien. */
const DEFAULT_LINE_WIDTH = 0.2

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
    ? `Zahlbar innerhalb von ${data.zahlungszielTage} Tagen netto. Fällig am ${deDate(data.dueDate)}.`
    : `Zahlbar innerhalb von ${data.zahlungszielTage} Tagen netto.`
  doc.text(dueText, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 })

  // Skonto als bedingter Nachlass (Rechnungsbetrag bleibt unverändert).
  if (data.skonto && data.skonto.prozent > 0) {
    y += 6
    const s = data.skonto
    const pct = s.prozent.toLocaleString('de-DE', { maximumFractionDigits: 2 })
    doc.setTextColor(90, 85, 80)
    doc.text(
      `Bei Zahlung bis ${deDate(s.date)}: ${pct} % Skonto = ${eur(s.amount)} — Zahlbetrag ${eur(s.payable)}.`,
      MARGIN,
      y,
      { maxWidth: PAGE_W - MARGIN * 2 },
    )
    doc.setTextColor(26, 26, 26)
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
  doc.text(SENDER.name.toUpperCase(), MARGIN, 22, { charSpace: 1.5 })
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
