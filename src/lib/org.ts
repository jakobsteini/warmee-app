import { supabase } from './supabase'

/**
 * Der aktuell angemeldete User. Wirft, wenn niemand angemeldet ist.
 */
async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Nicht angemeldet.')
  }
  return user
}

/**
 * org_id des aktuell angemeldeten Users aus seinem Profil.
 * Wird beim Anlegen von Datensätzen gebraucht, deren org_id keinen DB-Default
 * hat und deren RLS-Policy (with check) die korrekte Org verlangt.
 */
export async function getMyOrgId(): Promise<string> {
  const user = await requireUser()

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

/** id des aktuell angemeldeten Users (z. B. für assigned_by). */
export async function getMyUserId(): Promise<string> {
  const user = await requireUser()
  return user.id
}
