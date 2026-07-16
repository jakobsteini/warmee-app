import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { createNotification } from './notifications'
import { formatEUR } from './money'
import type { DunningCollection } from '../types/dunning'

// ============================================================================
// Inkasso-Übergabe + Rücknahme. Der Status „Inkasso" wird NICHT auf der Rechnung
// gespeichert, sondern ist ABGELEITET: existiert ein aktiver dunning_collections-
// Fall, ist die Rechnung in Inkasso. Snapshot friert offenen Betrag, erreichte
// Stufe und Bezeichnung zum Übergabezeitpunkt ein. Kein Löschen — eine Rücknahme
// setzt status='withdrawn', der Vorgang bleibt als Historie stehen. Übergabe und
// Rücknahme lösen je eine In-App-Benachrichtigung aus. Reine Entscheidungslogik
// (Button-Sichtbarkeit) liegt in dunningCollectionsCalc.ts.
// ============================================================================

/** Alle Inkasso-Fälle der Org, neueste Übergabe zuerst (RLS org-scoped). */
export async function listCollections(): Promise<DunningCollection[]> {
  const { data, error } = await supabase
    .from('dunning_collections')
    .select('*')
    .order('handed_over_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as DunningCollection[]
}

/** invoice_id → aktiver Inkasso-Fall (höchstens einer je Rechnung). */
export async function activeCollectionsByInvoice(): Promise<
  Map<string, DunningCollection>
> {
  const { data, error } = await supabase
    .from('dunning_collections')
    .select('*')
    .eq('status', 'active')
  if (error) throw error
  const map = new Map<string, DunningCollection>()
  for (const c of (data ?? []) as unknown as DunningCollection[]) {
    map.set(c.invoice_id, c)
  }
  return map
}

export interface HandOverInput {
  invoice_id: string
  dealer_id: string
  /** Nur für den Benachrichtigungstext. */
  dealer_name: string | null
  invoice_number: string
  open_amount: number
  level_number: number
  label: string
}

/**
 * Rechnung an Inkasso übergeben: eingefrorenen Fall anlegen (status='active')
 * und eine Benachrichtigung erzeugen. Die partielle Unique-Bedingung in der DB
 * verhindert einen zweiten aktiven Fall je Rechnung.
 */
export async function handOverToCollection(input: HandOverInput): Promise<void> {
  const [org_id, handed_over_by] = await Promise.all([
    getMyOrgId(),
    getMyUserId(),
  ])
  const { error } = await supabase.from('dunning_collections').insert({
    org_id,
    invoice_id: input.invoice_id,
    dealer_id: input.dealer_id,
    open_amount_snapshot: input.open_amount,
    level_number_snapshot: input.level_number,
    label_snapshot: input.label,
    handed_over_by,
    status: 'active',
  })
  if (error) throw error

  await createNotification({
    type: 'collection_handover',
    title: 'Inkasso-Übergabe',
    body: `${input.dealer_name ?? '—'} · ${input.invoice_number} · ${formatEUR(input.open_amount)}`,
    link: '/dunning',
  })
}

/**
 * Inkasso-Fall zurückziehen: status='withdrawn' + Grund/Benutzer/Zeit. Nichts
 * wird gelöscht; der Status der Rechnung geht (abgeleitet) auf die vorherige
 * Mahnstufe zurück. Erzeugt eine Benachrichtigung.
 */
export async function withdrawCollection(
  collection: DunningCollection,
  reason: string,
  dealerName: string | null,
  invoiceNumber: string,
): Promise<void> {
  const withdrawn_by = await getMyUserId()
  const { error } = await supabase
    .from('dunning_collections')
    .update({
      status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
      withdrawn_by,
      withdrawal_reason: reason,
    })
    .eq('id', collection.id)
    .eq('status', 'active')
  if (error) throw error

  await createNotification({
    type: 'collection_withdrawn',
    title: 'Inkasso zurückgezogen',
    body: `${dealerName ?? '—'} · ${invoiceNumber} · ${reason}`,
    link: '/dunning',
  })
}
