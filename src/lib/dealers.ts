import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { Dealer, DealerInput } from '../types/dealer'

/** Alle Händler der eigenen Org (RLS scoped automatisch), alphabetisch. */
export async function listDealers(): Promise<Dealer[]> {
  const { data, error } = await supabase
    .from('dealers')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/** Einen einzelnen Händler laden (für die Detailseite). */
export async function getDealer(id: string): Promise<Dealer> {
  const { data, error } = await supabase
    .from('dealers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** Neuen Händler anlegen. org_id wird aus dem Profil ergänzt. */
export async function createDealer(input: DealerInput): Promise<Dealer> {
  const org_id = await getMyOrgId()

  const { data, error } = await supabase
    .from('dealers')
    .insert({ ...input, org_id })
    .select()
    .single()

  if (error) throw error
  return data
}

/** Vorhandenen Händler aktualisieren. */
export async function updateDealer(
  id: string,
  input: DealerInput,
): Promise<Dealer> {
  const { data, error } = await supabase
    .from('dealers')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Freie CRM-Notiz eines Händlers speichern. Überschreibt das eine Notizfeld
 * bewusst (kein Log) und schreibt Zeitpunkt + Persona-Name mit, damit die
 * letzte Änderung sichtbar bleibt. Leerer Text → NULL (kein leerer String).
 */
export async function saveDealerNote(
  id: string,
  notiz: string,
  updatedBy: string,
): Promise<Dealer> {
  const trimmed = notiz.trim()
  const { data, error } = await supabase
    .from('dealers')
    .update({
      crm_notiz: trimmed === '' ? null : trimmed,
      crm_notiz_updated_at: new Date().toISOString(),
      crm_notiz_updated_by: updatedBy,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Händler löschen. */
export async function deleteDealer(id: string): Promise<void> {
  const { error } = await supabase.from('dealers').delete().eq('id', id)
  if (error) throw error
}
