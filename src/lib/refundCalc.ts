// Reine Rückerstattungs-Logik — bewusst OHNE Supabase-Import, damit sie unter
// `node --test` (ohne Vite-Env) prüfbar ist (Muster wie returnsCalc.ts /
// commissionCalc.ts). Die datenbeschaffenden Funktionen liegen in openPayments.ts
// und creditRating.ts und delegieren die Rechnung hierher.
//
// Hintergrund: Ist eine Rechnung bereits (ganz oder mit Skonto) BEZAHLT und kommt
// danach eine Retoure, ist der über die geminderte Forderung hinaus gezahlte
// Betrag dem Händler ZURÜCKZUERSTATTEN (Kundenentscheidung Theresa: Rückerstattung,
// kein Guthaben, keine Verrechnung).
//
// WICHTIG — die zentrale Definition bleibt unberührt: openAfterReturns (in
// returnsCalc.ts) ist die positive, bei 0 geklemmte Hälfte der signierten Position
//   signedNet = (total − Σ recorded returns) − paid_amount
// „Händler schuldet uns". refundDue ist die ANDERE, ebenfalls bei 0 geklemmte
// Hälfte „wir schulden dem Händler". Zwei Funktionen, eine Wahrheit — keine
// geänderte Rechendefinition.

/** numeric/number/null robust zu number (wie in returnsCalc.ts). */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Kaufmännisch auf 2 Nachkommastellen runden. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Rückzuerstattender Betrag (brutto) einer Rechnung, nie unter 0:
 *
 *   refundDue = max(0, paid_amount − (total − Σ recorded returns))
 *
 * = der über die um Retouren geminderte Forderung hinaus gezahlte Teil. Bei
 * unbezahlter Rechnung (paid_amount null → 0) immer 0 (die bleibt Offener Posten);
 * bei Skonto-Zahlung (paid_amount = brutto − Skonto) wird nur der tatsächlich
 * überzahlte Teil erstattet, nicht der volle Retourenbetrag.
 */
export function refundDue(
  total: number | string,
  returnsTotal: number,
  paidAmount: number | string | null | undefined,
): number {
  const reducedClaim = num(total) - returnsTotal
  const over = num(paidAmount) - reducedClaim
  return over > 0 ? round2(over) : 0
}

/** Eingaben für die Aggregation je Rechnung. */
export interface RefundInput {
  total: number | string
  returnsTotal: number
  paidAmount: number | string | null | undefined
}

/**
 * Summe der offenen Rückerstattungen über eine Menge Rechnungen (org-weit oder je
 * Händler). Jede Rechnung wird einzeln geklemmt (refundDue), erst dann summiert —
 * eine überzahlte Rechnung darf nicht gegen eine unterzahlte aufgerechnet werden.
 */
export function totalRefunds(rows: RefundInput[]): number {
  return round2(
    rows.reduce((s, r) => s + refundDue(r.total, r.returnsTotal, r.paidAmount), 0),
  )
}
