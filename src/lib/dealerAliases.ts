import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { DealerAlias } from '../types/dealerAlias'

/** Alle Alias-Namen eines Händlers (RLS org-scoped), älteste zuerst. */
export async function listDealerAliases(
  dealerId: string,
): Promise<DealerAlias[]> {
  const { data, error } = await supabase
    .from('dealer_aliases')
    .select('*')
    .eq('dealer_id', dealerId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Alle Aliasse der eigenen Org auf einmal (für die Suche in der Händlerliste).
 * Ein flacher Load statt N Einzelabfragen; der Aufrufer gruppiert je dealer_id.
 */
export async function listAllDealerAliases(): Promise<DealerAlias[]> {
  const { data, error } = await supabase.from('dealer_aliases').select('*')
  if (error) throw error
  return data ?? []
}

/** Einen Alias anlegen. org_id wird aus dem Profil ergänzt. */
export async function createDealerAlias(
  dealerId: string,
  alias: string,
): Promise<DealerAlias> {
  const org_id = await getMyOrgId()

  const { data, error } = await supabase
    .from('dealer_aliases')
    .insert({ org_id, dealer_id: dealerId, alias: alias.trim() })
    .select()
    .single()

  if (error) throw error
  return data
}

/** Einen Alias löschen. */
export async function deleteDealerAlias(id: string): Promise<void> {
  const { error } = await supabase.from('dealer_aliases').delete().eq('id', id)
  if (error) throw error
}
