import { supabase } from './supabase'
import { getMyOrgId } from './org'
import { normalizeGroupName } from './articleGroups'
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
