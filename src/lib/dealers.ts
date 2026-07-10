import { supabase } from './supabase'
import type { Dealer, DealerInput } from '../types/dealer'

/**
 * org_id des aktuell angemeldeten Users aus seinem Profil.
 * Wird beim Anlegen eines Händlers gebraucht, da dealers.org_id keinen
 * DB-Default hat und die RLS-Policy (with check) die korrekte Org verlangt.
 */
async function getMyOrgId(): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Nicht angemeldet.')
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    throw new Error('Organisation konnte nicht ermittelt werden.')
  }

  return data.org_id
}

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
