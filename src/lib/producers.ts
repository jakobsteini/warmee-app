import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { Producer, ProducerInput } from '../types/producer'

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

/** Einen einzelnen Lieferanten laden (für die Bestellmail/das Bestell-PDF). */
export async function getProducer(id: string): Promise<Producer> {
  const { data, error } = await supabase
    .from('producers')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Producer
}

/** Neuen Lieferanten anlegen. org_id wird aus dem Profil ergänzt. */
export async function createProducer(input: ProducerInput): Promise<Producer> {
  const org_id = await getMyOrgId()
  const { data, error } = await supabase
    .from('producers')
    .insert({ ...input, org_id })
    .select()
    .single()
  if (error) throw error
  return data as Producer
}

/** Vorhandenen Lieferanten aktualisieren. */
export async function updateProducer(
  id: string,
  input: ProducerInput,
): Promise<Producer> {
  const { data, error } = await supabase
    .from('producers')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Producer
}
