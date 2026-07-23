import { supabase } from './supabase'
import { getMyOrgId } from './org'
import {
  normalizeGroupName,
  evaluateArticleGroups,
  type GroupEvalPosition,
} from './articleGroups'
import type { ArticleGroup } from '../types/articleGroup'

/**
 * Daten-/CRUD-Schicht der Artikel-Gruppen (RLS scoped die Org automatisch). Die
 * Validierung (leer/Duplikat) liegt im supabase-freien Kern `articleGroups.ts`
 * und wird im Formular VOR dem Schreiben erzwungen; hier wird nur getrimmt
 * gespeichert. Der Unique-Index (org_id, name) ist der DB-Backstop.
 */

/** Alle Gruppen der eigenen Org, alphabetisch. */
export async function listArticleGroups(): Promise<ArticleGroup[]> {
  const { data, error } = await supabase
    .from('article_groups')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ArticleGroup[]
}

/** Neue Gruppe anlegen (org_id aus dem Profil). Name wird getrimmt gespeichert. */
export async function createArticleGroup(name: string): Promise<ArticleGroup> {
  const org_id = await getMyOrgId()
  const { data, error } = await supabase
    .from('article_groups')
    .insert({ org_id, name: normalizeGroupName(name) })
    .select()
    .single()
  if (error) throw error
  return data as ArticleGroup
}

/** Gruppe umbenennen (getrimmt). */
export async function renameArticleGroup(
  id: string,
  name: string,
): Promise<ArticleGroup> {
  const { data, error } = await supabase
    .from('article_groups')
    .update({ name: normalizeGroupName(name) })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ArticleGroup
}

/**
 * Gruppe löschen. Der FK products.group_id ist ohne ON DELETE — Postgres blockt
 * das Löschen einer noch referenzierten Gruppe hart. Die UI prüft zusätzlich
 * vorher (groupInUse) und zeigt eine verständliche Meldung statt des DB-Fehlers.
 */
export async function deleteArticleGroup(id: string): Promise<void> {
  const { error } = await supabase.from('article_groups').delete().eq('id', id)
  if (error) throw error
}

// ────────────────────────────────────────────────────────────────────────────
// Auswertung je Gruppe (reine Lese-Auswertung). Umsatz = bestätigte Orders,
// netto je Position quantity × (unit_price, ersatzweise wholesale_price) —
// dieselbe Konvention wie analytics.ts. Aggregation im supabase-freien Kern.
// ────────────────────────────────────────────────────────────────────────────

/** Eine Zeile der Gruppen-Auswertung (Beträge in Euro, netto). name=null = ohne Gruppe. */
export interface ArticleGroupReportRow {
  id: string | null
  name: string | null
  articleCount: number
  quantity: number
  net: number
}

export interface ArticleGroupReport {
  rows: ArticleGroupReportRow[]
  total: { articleCount: number; quantity: number; net: number }
}

interface RawReportOrder {
  order_items: {
    quantity: number
    unit_price: number | string | null
    product: {
      id: string
      group_id: string | null
      wholesale_price: number | string | null
    } | null
  }[]
}

/**
 * Auswertung je Artikel-Gruppe für eine Saison (oder 'all'). Read-only, RLS
 * scoped die Org. Delegiert die Aggregation an `evaluateArticleGroups`.
 */
export async function getArticleGroupReport(
  seasonId: string | 'all',
): Promise<ArticleGroupReport> {
  const groups = await listArticleGroups()

  let query = supabase
    .from('orders')
    .select(
      'order_items(quantity, unit_price, product:products(id, group_id, wholesale_price))',
    )
    .eq('status', 'confirmed')
  if (seasonId !== 'all') query = query.eq('season_id', seasonId)

  const { data, error } = await query
  if (error) throw error
  const orders = (data ?? []) as unknown as RawReportOrder[]

  const positions: GroupEvalPosition[] = []
  for (const o of orders) {
    for (const it of o.order_items ?? []) {
      if (!it.product) continue // FK NOT NULL → praktisch unerreichbar
      positions.push({
        group_id: it.product.group_id,
        product_id: it.product.id,
        quantity: it.quantity ?? 0,
        unit_price: it.unit_price,
        wholesale_price: it.product.wholesale_price,
      })
    }
  }

  const { rows, total } = evaluateArticleGroups(
    positions,
    groups.map((g) => ({ id: g.id })),
  )
  const nameById = new Map(groups.map((g) => [g.id, g.name]))

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.id === null ? null : (nameById.get(r.id) ?? '—'),
      articleCount: r.articleCount,
      quantity: r.quantity,
      net: r.netCents / 100,
    })),
    total: {
      articleCount: total.articleCount,
      quantity: total.quantity,
      net: total.netCents / 100,
    },
  }
}
