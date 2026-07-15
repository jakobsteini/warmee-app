import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { DealerSeasonPriority } from '../types/dealerPriority'

/** Alle Saison-Prioritäten eines Händlers (RLS org-scoped). */
export async function listDealerPriorities(
  dealerId: string,
): Promise<DealerSeasonPriority[]> {
  const { data, error } = await supabase
    .from('dealer_season_priority')
    .select('*')
    .eq('dealer_id', dealerId)

  if (error) throw error
  return data ?? []
}

/**
 * Priorität für (Händler, Saison) setzen. Legt sie an oder aktualisiert sie
 * (Unique-Constraint dealer_id+season_id). org_id aus dem Profil.
 */
export async function setDealerPriority(
  dealerId: string,
  seasonId: string,
  priority: number,
): Promise<void> {
  const org_id = await getMyOrgId()

  const { error } = await supabase.from('dealer_season_priority').upsert(
    {
      org_id,
      dealer_id: dealerId,
      season_id: seasonId,
      priority,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'dealer_id,season_id' },
  )

  if (error) throw error
}

/** Priorität für (Händler, Saison) entfernen. */
export async function deleteDealerPriority(
  dealerId: string,
  seasonId: string,
): Promise<void> {
  const { error } = await supabase
    .from('dealer_season_priority')
    .delete()
    .eq('dealer_id', dealerId)
    .eq('season_id', seasonId)

  if (error) throw error
}
