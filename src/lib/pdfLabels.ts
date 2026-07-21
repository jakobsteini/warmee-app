/**
 * Zweisprachige Beleg-Labels für Rechnung und Lieferschein (Volltext-Übersetzung
 * der PDFs, DE/EN). Bewusst supabase- und jsPDF-frei → unter `node --test`
 * prüfbar (wie die anderen Rechenkerne, siehe KONVENTIONEN in CLAUDE.md).
 *
 * WÄCHTER: Diese Datei enthält NUR Text/Labels. Keine Beträge, keine Steuerlogik,
 * kein Layout. Zahlen, Datum und Währung bleiben in pdf.ts de-DE/EUR formatiert
 * und werden als bereits fertige Strings in die Fließtext-Funktionen
 * (`payableWithin`, `skontoLine`) hereingereicht — hier wird nur der Satz gebaut.
 *
 * Sprachwahl an den Belegen: `dealer.language` ('en' → Englisch, sonst Deutsch).
 * Dasselbe Muster nutzt bereits die AB (AB_TEXTS in orderConfirmation.ts); pdf.ts
 * bleibt Layout-only und bekommt die aufgelösten Labels herein.
 *
 * Bewusst NICHT hier: Kommissionierschein und Lagerliste — beide sind interne
 * Dokumente ohne fremdsprachigen Empfänger und bleiben deutsch.
 */

export type PdfLang = 'de' | 'en'

/** `dealer.language` → PdfLang (de-Fallback bei null/unbekannt). */
export function pdfLang(language: string | null | undefined): PdfLang {
  return language === 'en' ? 'en' : 'de'
}

/** Aufgelöste Rechnungs-Labels in der Kundensprache. */
export interface InvoicePdfLabels {
  title: string
  recipient: string
  number: string
  date: string
  dueDate: string
  colArticle: string
  colColor: string
  colSize: string
  colQty: string
  colUnit: string
  colSum: string
  subtotal: string
  /** USt-/VAT-Label; der Satz wird in pdf.ts als „(X %)" angehängt. */
  vat: string
  gross: string
  /** „Zahlbar innerhalb von N Tagen netto[. Fällig am D]." — D bereits formatiert. */
  payableWithin: (days: number, dueDateFormatted: string | null) => string
  /**
   * „Bei Zahlung bis D: P % Skonto = A — Zahlbetrag Z." — alle Werte bereits in
   * pdf.ts formatiert (deDate/eur/de-DE), diese Funktion setzt nur den Satz.
   */
  skontoLine: (
    dateFormatted: string,
    pctFormatted: string,
    amountFormatted: string,
    payableFormatted: string,
  ) => string
}

/** Aufgelöste Lieferschein-Labels in der Kundensprache. */
export interface DeliveryNotePdfLabels {
  title: string
  recipient: string
  number: string
  date: string
  season: string
  colArticle: string
  colColor: string
  colSize: string
  colQty: string
  totalQuantity: string
}

const INVOICE_LABELS: Record<PdfLang, InvoicePdfLabels> = {
  de: {
    title: 'Rechnung',
    recipient: 'Rechnungsempfänger',
    number: 'Nr.',
    date: 'Datum',
    dueDate: 'Fällig am',
    colArticle: 'Artikel',
    colColor: 'Farbe',
    colSize: 'Größe',
    colQty: 'Menge',
    colUnit: 'Einzelpreis',
    colSum: 'Summe',
    subtotal: 'Nettobetrag',
    vat: 'USt',
    gross: 'Gesamtbetrag (brutto)',
    payableWithin: (days, due) =>
      due
        ? `Zahlbar innerhalb von ${days} Tagen netto. Fällig am ${due}.`
        : `Zahlbar innerhalb von ${days} Tagen netto.`,
    skontoLine: (date, pct, amount, payable) =>
      `Bei Zahlung bis ${date}: ${pct} % Skonto = ${amount} — Zahlbetrag ${payable}.`,
  },
  en: {
    title: 'Invoice',
    recipient: 'Invoice recipient',
    number: 'No.',
    date: 'Date',
    dueDate: 'Due on',
    colArticle: 'Article',
    colColor: 'Colour',
    colSize: 'Size',
    colQty: 'Qty',
    colUnit: 'Unit price',
    colSum: 'Sum',
    subtotal: 'Net amount',
    vat: 'VAT',
    gross: 'Total (gross)',
    payableWithin: (days, due) =>
      due
        ? `Payable within ${days} days net. Due on ${due}.`
        : `Payable within ${days} days net.`,
    skontoLine: (date, pct, amount, payable) =>
      `On payment by ${date}: ${pct} % cash discount = ${amount} — amount payable ${payable}.`,
  },
}

const DELIVERY_NOTE_LABELS: Record<PdfLang, DeliveryNotePdfLabels> = {
  de: {
    title: 'Lieferschein',
    recipient: 'Empfänger',
    number: 'Nr.',
    date: 'Datum',
    season: 'Saison',
    colArticle: 'Artikel',
    colColor: 'Farbe',
    colSize: 'Größe',
    colQty: 'Menge',
    totalQuantity: 'Gesamtmenge',
  },
  en: {
    title: 'Delivery note',
    recipient: 'Recipient',
    number: 'No.',
    date: 'Date',
    season: 'Season',
    colArticle: 'Article',
    colColor: 'Colour',
    colSize: 'Size',
    colQty: 'Qty',
    totalQuantity: 'Total quantity',
  },
}

/** Rechnungs-Labels in der gewählten Sprache. */
export function invoicePdfLabels(lang: PdfLang): InvoicePdfLabels {
  return INVOICE_LABELS[lang]
}

/** Lieferschein-Labels in der gewählten Sprache. */
export function deliveryNotePdfLabels(lang: PdfLang): DeliveryNotePdfLabels {
  return DELIVERY_NOTE_LABELS[lang]
}
