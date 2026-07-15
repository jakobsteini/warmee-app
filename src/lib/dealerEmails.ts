import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { DealerEmail, DealerEmailInput } from '../types/dealerEmail'

/** Alle E-Mail-Zuständigkeiten eines Händlers (RLS org-scoped). */
export async function listDealerEmails(
  dealerId: string,
): Promise<DealerEmail[]> {
  const { data, error } = await supabase
    .from('dealer_emails')
    .select('*')
    .eq('dealer_id', dealerId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/** Eine E-Mail-Zuständigkeit anlegen. org_id wird aus dem Profil ergänzt. */
export async function createDealerEmail(
  dealerId: string,
  input: DealerEmailInput,
): Promise<DealerEmail> {
  const org_id = await getMyOrgId()

  const { data, error } = await supabase
    .from('dealer_emails')
    .insert({
      org_id,
      dealer_id: dealerId,
      email: input.email.trim(),
      role: input.role,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** Eine E-Mail-Zuständigkeit löschen. */
export async function deleteDealerEmail(id: string): Promise<void> {
  const { error } = await supabase.from('dealer_emails').delete().eq('id', id)
  if (error) throw error
}
