/**
 * Artikel-Gruppen: reiner Rechenkern (Validierung + Auswertungs-Helfer),
 * supabase-frei → unter `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 * Die Daten-/CRUD-Schicht (Supabase) liegt getrennt in `articleGroupsData.ts`.
 */

/** Gruppenname normalisieren (nur trimmen — Groß-/Kleinschreibung bleibt erhalten). */
export function normalizeGroupName(raw: string): string {
  return raw.trim()
}

/**
 * Validiert einen (neuen oder umbenannten) Gruppennamen: nicht leer nach Trim und
 * kein Duplikat je Org (Vergleich case-insensitiv + getrimmt, damit „Mützen" und
 * „ mützen " als gleich gelten). Bei Fehler ein i18n-Key für die sichtbare
 * Meldung (block-statt-raten). `existingNames` = die bereits vergebenen Namen.
 */
export type GroupNameParse =
  | { ok: true; value: string }
  | { ok: false; error: string }

export function validateGroupName(
  raw: string,
  existingNames: string[],
): GroupNameParse {
  const value = normalizeGroupName(raw)
  if (value === '') return { ok: false, error: 'articleGroups.err.nameEmpty' }
  const key = value.toLowerCase()
  const dup = existingNames.some((n) => n.trim().toLowerCase() === key)
  if (dup) return { ok: false, error: 'articleGroups.err.nameDuplicate' }
  return { ok: true, value }
}

/** Hängt mindestens ein Artikel an dieser Gruppe? (Grundlage der Lösch-Sperre.) */
export function groupInUse(
  groupId: string,
  products: { group_id: string | null }[],
): boolean {
  return products.some((p) => p.group_id === groupId)
}

/** Eine Zählzeile der Auswertung: Gruppe (oder „ohne Gruppe") + Artikelanzahl. */
export interface GroupCount {
  id: string
  name: string
  count: number
}

/**
 * Artikelanzahl je Gruppe für spätere Auswertungen. Liefert die Gruppen in der
 * übergebenen Reihenfolge (jeweils mit Zählung, auch 0) plus die Zahl der Artikel
 * ohne Gruppe getrennt. Die UI beschriftet die „ohne Gruppe"-Zeile selbst
 * (lokalisiert) — der Kern bleibt sprachneutral.
 */
export function groupArticleCounts(
  products: { group_id: string | null }[],
  groups: { id: string; name: string }[],
): { counts: GroupCount[]; ungrouped: number } {
  const byId = new Map<string, number>()
  let ungrouped = 0
  for (const p of products) {
    if (p.group_id == null) ungrouped++
    else byId.set(p.group_id, (byId.get(p.group_id) ?? 0) + 1)
  }
  const counts = groups.map((g) => ({
    id: g.id,
    name: g.name,
    count: byId.get(g.id) ?? 0,
  }))
  return { counts, ungrouped }
}
