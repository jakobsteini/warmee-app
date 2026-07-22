import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type {
  DefectReturn,
  DefectReturnWithRefs,
  CreateDefectReturnInput,
} from '../types/defectReturn'

// ============================================================================
// Datenschicht Fehlerhafte Retouren (Doku, Anforderung 6.1). Reine Erfassung +
// Liste — keine Folgeprozesse, keine Auswertung, kein Nummernkreis.
// ============================================================================

/** Alle dokumentierten Mangel-Retouren inkl. Produkt-/Lieferantenname, neueste zuerst. */
export async function listDefectReturns(): Promise<DefectReturnWithRefs[]> {
  const { data, error } = await supabase
    .from('defect_returns')
    .select('*, product:products(name), producer:producers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as DefectReturnWithRefs[]
}

/** Eine Mangel-Retoure dokumentieren. */
export async function createDefectReturn(
  input: CreateDefectReturnInput,
): Promise<DefectReturn> {
  const [org_id, created_by] = await Promise.all([getMyOrgId(), getMyUserId()])
  const { data, error } = await supabase
    .from('defect_returns')
    .insert({
      org_id,
      product_id: input.product_id,
      article_text: input.article_text,
      color: input.color,
      size: input.size,
      quantity: input.quantity,
      producer_id: input.producer_id,
      beleg_bezug: input.beleg_bezug,
      value_ek: input.value_ek,
      value_vk: input.value_vk,
      defect_note: input.defect_note,
      created_by,
    })
    .select()
    .single()
  if (error) throw error
  return data as DefectReturn
}

/** Einen Doku-Eintrag löschen (reine Doku ohne Folgeprozesse). */
export async function deleteDefectReturn(id: string): Promise<void> {
  const { error } = await supabase.from('defect_returns').delete().eq('id', id)
  if (error) throw error
}
