import { supabase } from './supabase'
import type { Producer } from '../types/producer'

/**
 * Alle Produzenten der eigenen Org (RLS scoped automatisch), sortiert nach
 * Priorität (kleiner = höher), dann Name. Grundlage für die spätere
 * Produzenten-Auswahl und Priorisierung.
 */
export async function listProducers(): Promise<Producer[]> {
  const { data, error } = await supabase
    .from('producers')
    .select('*')
    .order('priority', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Producer[]
}

/** Nur aktive Produzenten (für neue Produktionsbestellungen wählbar). */
export async function listActiveProducers(): Promise<Producer[]> {
  return (await listProducers()).filter((p) => p.active)
}
