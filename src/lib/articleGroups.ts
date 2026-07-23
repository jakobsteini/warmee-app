/**
 * Artikel-Gruppen: reiner Rechenkern (Validierung + Auswertungs-Helfer),
 * supabase-frei → unter `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 * Die Daten-/CRUD-Schicht (Supabase) liegt getrennt in `articleGroupsData.ts`.
 */

import { parseDecimalField } from './paymentTerms.ts'

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

// ────────────────────────────────────────────────────────────────────────────
// Auswertung je Gruppe: Anzahl (distinct) Artikel, bestellte Menge und
// Netto-Umsatz aus den Order-Positionen. Beträge Cent-genau (Ganzzahl) →
// Summe der Zeilen entspricht exakt der Gesamtsumme (keine Float-Drift).
// ────────────────────────────────────────────────────────────────────────────

/** Eine Order-Position, angereichert um Gruppe + Preisfelder des Artikels. */
export interface GroupEvalPosition {
  group_id: string | null
  product_id: string
  quantity: number
  unit_price: string | number | null
  /** Fallback-Preis (Artikel), wenn die Position keinen Stückpreis trägt. */
  wholesale_price: string | number | null
}

/** Eine Auswertungszeile. id=null = „ohne Gruppe". Betrag in Cent (Ganzzahl). */
export interface GroupEvalRow {
  id: string | null
  articleCount: number
  quantity: number
  netCents: number
}

export interface GroupEvaluation {
  rows: GroupEvalRow[]
  total: { articleCount: number; quantity: number; netCents: number }
}

/**
 * Betrag robust über parseDecimalField lesen (Zahl ODER String aus der DB).
 * Leer/ungültig → null (der Aufrufer fällt dann auf den Ersatzpreis zurück).
 */
function parseAmount(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const parsed = parseDecimalField(typeof v === 'number' ? String(v) : v)
  return parsed.ok ? parsed.value : null
}

/**
 * Netto-Cent einer Position: Menge × Stückpreis (ersatzweise wholesale_price,
 * wie in analytics.ts). In Cent gerundet und ganzzahlig gehalten, damit die
 * Summe der Zeilen exakt der Gesamtsumme entspricht.
 */
function positionNetCents(pos: GroupEvalPosition): number {
  const unit = parseAmount(pos.unit_price)
  const price = unit != null ? unit : (parseAmount(pos.wholesale_price) ?? 0)
  const priceCents = Math.round(price * 100)
  return Math.round((pos.quantity ?? 0) * priceCents)
}

/**
 * Menge + Netto-Umsatz je Gruppe aggregieren. Alle übergebenen Gruppen werden
 * als Zeile geführt (auch mit 0, für den stabilen Saison-Vergleich); Artikel
 * OHNE Gruppe kommen als eigene Zeile (id=null) — NUR wenn tatsächlich welche
 * bestellt wurden — nichts wird verschluckt. Sortierung: Netto-Umsatz absteigend
 * (Tie: Menge absteigend, dann id — deterministisch). Die Gesamtsumme ist die
 * Summe der Zeilen (identisch by construction).
 */
export function evaluateArticleGroups(
  positions: GroupEvalPosition[],
  groups: { id: string }[],
): GroupEvaluation {
  const acc = new Map<
    string | null,
    { products: Set<string>; quantity: number; netCents: number }
  >()
  const ensure = (id: string | null) => {
    let e = acc.get(id)
    if (!e) {
      e = { products: new Set<string>(), quantity: 0, netCents: 0 }
      acc.set(id, e)
    }
    return e
  }

  // Definierte Gruppen immer als Zeile (stabiler Vergleich über Saisonen).
  for (const g of groups) ensure(g.id)

  let hasUngrouped = false
  for (const pos of positions) {
    const qty = pos.quantity ?? 0
    const net = positionNetCents(pos)
    if (qty <= 0 && net <= 0) continue // keine Aussage (leere Position)
    const key = pos.group_id ?? null
    if (key === null) hasUngrouped = true
    const e = ensure(key) // unbekannte group_id bekommt trotzdem eine Zeile
    e.quantity += qty
    e.netCents += net
    if (pos.product_id) e.products.add(pos.product_id)
  }

  // „Ohne Gruppe" nur zeigen, wenn wirklich ungruppierte Ware bestellt wurde.
  if (!hasUngrouped) acc.delete(null)

  const rows: GroupEvalRow[] = [...acc.entries()].map(([id, e]) => ({
    id,
    articleCount: e.products.size,
    quantity: e.quantity,
    netCents: e.netCents,
  }))
  rows.sort(
    (a, b) =>
      b.netCents - a.netCents ||
      b.quantity - a.quantity ||
      String(a.id).localeCompare(String(b.id)),
  )

  const total = rows.reduce(
    (t, r) => ({
      articleCount: t.articleCount + r.articleCount,
      quantity: t.quantity + r.quantity,
      netCents: t.netCents + r.netCents,
    }),
    { articleCount: 0, quantity: 0, netCents: 0 },
  )

  return { rows, total }
}
