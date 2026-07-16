import { supabase } from './supabase'
import { getMyOrgId } from './org'
import { listOpenPayments } from './openPayments'
import { activeCollectionsByInvoice } from './dunningCollections'
import { faelligkeitIso, isOverdue, daysOverdue, todayIso } from './dueDates'
import type {
  DunningLevel,
  DunningLevelInput,
  OverdueInvoiceRow,
} from '../types/dunning'

// ============================================================================
// Mahnwesen — Konfiguration der Stufen + Ableitung der erreichten Stufe je
// überfälliger Rechnung. KEIN Versand, keine Templates (eigener Baustein).
// Überfälligkeit kommt aus derselben Logik wie die Offene-Posten-Liste
// (listOpenPayments + dueDates) — bewusst keine zweite Definition.
// ============================================================================

/** numeric/number robust zu number. */
function num(v: number | string | null): number {
  if (v === null || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

// ─── Mahnstufen (konfigurierbar) ────────────────────────────────────────────

/** Alle Mahnstufen der Org, aufsteigend nach Stufennummer. */
export async function listDunningLevels(): Promise<DunningLevel[]> {
  const { data, error } = await supabase
    .from('dunning_levels')
    .select('*')
    .order('level_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as DunningLevel[]
}

/** Neue Mahnstufe anlegen. */
export async function createDunningLevel(
  input: DunningLevelInput,
): Promise<void> {
  const org_id = await getMyOrgId()
  const { error } = await supabase
    .from('dunning_levels')
    .insert({ org_id, ...input })
  if (error) throw error
}

/** Bestehende Mahnstufe ändern. */
export async function updateDunningLevel(
  id: string,
  patch: Partial<DunningLevelInput>,
): Promise<void> {
  const { error } = await supabase
    .from('dunning_levels')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

/** Mahnstufe löschen. */
export async function deleteDunningLevel(id: string): Promise<void> {
  const { error } = await supabase.from('dunning_levels').delete().eq('id', id)
  if (error) throw error
}

/**
 * Stufen in der übergebenen Reihenfolge neu durchnummerieren (1..N). Zweiphasig,
 * um die unique(org_id, level_number)-Bedingung beim Umsortieren nicht zu
 * verletzen: erst auf hohe Temporärwerte parken, dann final vergeben.
 */
export async function reorderDunningLevels(
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('dunning_levels')
      .update({ level_number: 1000 + i })
      .eq('id', orderedIds[i])
    if (error) throw error
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('dunning_levels')
      .update({ level_number: i + 1 })
      .eq('id', orderedIds[i])
    if (error) throw error
  }
}

// ─── Erreichte Stufe je Rechnung ────────────────────────────────────────────

/**
 * Höchste Stufe, deren Schwelle (days_after_due) bei gegebener Überfälligkeit
 * schon erreicht ist. Robust gegenüber der Reihenfolge der Stufen: es zählt der
 * größte days_after_due ≤ daysOverdue. null, wenn noch keine Stufe greift.
 */
export function reachedLevel(
  daysOverdueValue: number,
  levels: DunningLevel[],
): DunningLevel | null {
  let best: DunningLevel | null = null
  for (const l of levels) {
    if (l.days_after_due <= daysOverdueValue) {
      if (!best || l.days_after_due > best.days_after_due) best = l
    }
  }
  return best
}

/** Ergebnis der Mahn-Übersicht: die konfigurierten Stufen + die überfälligen Zeilen. */
export interface OverdueDossier {
  levels: DunningLevel[]
  rows: OverdueInvoiceRow[]
}

/**
 * Überfällige Rechnungen mit erreichter Stufe. Nutzt listOpenPayments (versendet,
 * unbezahlt) und filtert über die gemeinsame isOverdue-Logik; am längsten
 * überfällige zuerst.
 */
export async function listOverdueWithLevels(): Promise<OverdueDossier> {
  const [levels, invoices, activeCollections] = await Promise.all([
    listDunningLevels(),
    listOpenPayments(),
    activeCollectionsByInvoice(),
  ])
  const today = todayIso()

  const rows: OverdueInvoiceRow[] = invoices
    .filter((inv) => isOverdue(inv, today))
    .map((inv) => {
      const days = daysOverdue(inv, today) ?? 0
      const total = num(inv.total)
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        dealer_id: inv.dealer_id,
        dealer_name: inv.dealer?.name ?? null,
        total,
        open_amount: total - num(inv.paid_amount),
        faellig_iso: faelligkeitIso(inv),
        days_overdue: days,
        level: reachedLevel(days, levels),
        collection: activeCollections.get(inv.id) ?? null,
      }
    })
    .sort((a, b) => b.days_overdue - a.days_overdue)

  return { levels, rows }
}
