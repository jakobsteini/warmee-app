import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { OssCountryRate, OssCountryRateInput } from '../types/ossRate'

/** numeric/number/null robust zu number (wie in creditRating.ts). */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Alle OSS-Sätze der eigenen Org (RLS scoped), alphabetisch nach Land. */
export async function listOssRates(): Promise<OssCountryRate[]> {
  const { data, error } = await supabase
    .from('oss_country_rates')
    .select('*')
    .order('country_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as OssCountryRate[]
}

/** Neuen OSS-Satz anlegen. org_id aus dem Profil; country_iso2 als Großbuchstaben. */
export async function createOssRate(
  input: OssCountryRateInput,
): Promise<OssCountryRate> {
  const org_id = await getMyOrgId()
  const { data, error } = await supabase
    .from('oss_country_rates')
    .insert({
      ...input,
      country_iso2: input.country_iso2.toUpperCase(),
      org_id,
    })
    .select()
    .single()
  if (error) throw error
  return data as OssCountryRate
}

/** Satz und/oder Aktiv-Status eines OSS-Landes aktualisieren. */
export async function updateOssRate(
  id: string,
  patch: { vat_rate?: number; active?: boolean },
): Promise<OssCountryRate> {
  const { data, error } = await supabase
    .from('oss_country_rates')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as OssCountryRate
}

/**
 * OSS-Sätze in die Map ISO2 → FAKTOR wandeln, die taxCalc erwartet. Nur AKTIVE
 * Länder: ein deaktiviertes Land soll bei B2C-EU bewusst als „ossMissing" auffallen
 * (sichtbarer Fallback), nicht still mit altem Satz weiterrechnen.
 */
export function ossRateMap(
  rates: readonly OssCountryRate[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rates) {
    if (r.active) map[r.country_iso2.toUpperCase()] = num(r.vat_rate)
  }
  return map
}
