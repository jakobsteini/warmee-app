/**
 * Reiner Kern fürs Fehlerhafte-Retouren-Doku (supabase-frei, `node --test`).
 * Validiert die Eingaben vor dem Speichern: ein Artikel-Bezug (Produkt ODER
 * Bezeichnung) und eine positive Menge sind Pflicht — der Rest ist optional.
 */

export interface DefectReturnValidationInput {
  product_id: string | null
  article_text: string | null
  quantity: number
}

export interface DefectReturnValidation {
  ok: boolean
  /** i18n-Key des ersten Fehlers, oder null. */
  errorKey: string | null
}

export function validateDefectReturn(
  input: DefectReturnValidationInput,
): DefectReturnValidation {
  const hasArticle =
    !!input.product_id || !!(input.article_text && input.article_text.trim())
  if (!hasArticle) {
    return { ok: false, errorKey: 'defectReturns.errorArticle' }
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, errorKey: 'defectReturns.errorQuantity' }
  }
  return { ok: true, errorKey: null }
}
