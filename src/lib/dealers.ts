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

/** Händler löschen. */
export async function deleteDealer(id: string): Promise<void> {
  const { error } = await supabase.from('dealers').delete().eq('id', id)
  if (error) throw error
}
