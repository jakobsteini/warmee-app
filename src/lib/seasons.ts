import { supabase } from './supabase'
import type { Season } from '../types/asset'

/**
 * Alle Saisons der eigenen Org (RLS scoped automatisch).
 * Aktive Saison zuerst, danach absteigend nach Code (neueste oben).
 */
export async function listSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('is_active', { ascending: false })
    .order('code', { ascending: false })

  if (error) throw error
  return data ?? []
}
