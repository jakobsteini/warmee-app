/**
 * DRY-RUN-Analyse: Bilder (assets) den Artikeln (products) zuordnen.
 *
 * NUR LESEN. Dieses Skript schreibt NICHTS in die DB — kein insert/update/
 * upsert/delete, keine Zuordnung wird gespeichert. Es liest assets und products
 * der angegebenen Organisation, matcht das aus dem Dateinamen abgeleitete
 * assets.model gegen products.style (case-insensitive, getrimmt) und gibt einen
 * Report aus: eindeutige Treffer, Nicht-Treffer, Mehrdeutigkeiten sowie die
 * Bilder, die per Modell gar nicht zuordenbar sind (nur Farbcode) bzw. als
 * _SocialMedia markiert sind.
 *
 * Ausführen (liest live, schreibt nichts):
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… MATCH_ORG_ID=<uuid> \
 *     [MATCH_SEASON=SS27] node scripts/matchAssetsToProducts.ts
 *
 * MATCH_SEASON ist optional: ist es gesetzt, werden nur products dieser Saison
 * als Match-Kandidaten herangezogen (Code → season_id wird aufgelöst).
 */

// ─── Konfiguration ───────────────────────────────────────────────────────────

const ORG_ID = process.env.MATCH_ORG_ID
const SEASON = process.env.MATCH_SEASON ?? null // z. B. "SS27" oder ungesetzt

// ─── Reine Match-Logik (ohne DB) ─────────────────────────────────────────────

/** Vergleichsnormalisierung: getrimmt + klein. */
function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

interface AssetRow {
  id: string
  filename: string
  model: string | null
  color_code: string | null
  color_name: string | null
  color_code_2: string | null
  color_name_2: string | null
  is_social_media: boolean
  season_id: string | null
}

interface ProductRow {
  id: string
  style: string | null
  name: string | null
  season_id: string | null
}

type MatchKind = 'unique' | 'none' | 'ambiguous'

interface AssetMatch {
  asset: AssetRow
  kind: MatchKind
  products: ProductRow[] // getroffene Artikel (0, 1 oder >1)
}

/**
 * Baut einen Index normStyle → Artikel[] und ordnet jedem Bild MIT Modell
 * einen Match-Typ zu. Bilder ohne Modell werden hier nicht betrachtet.
 */
function matchModels(
  assets: AssetRow[],
  products: ProductRow[],
): AssetMatch[] {
  const byStyle = new Map<string, ProductRow[]>()
  for (const p of products) {
    const key = norm(p.style)
    if (!key) continue // Artikel ohne Style ist kein Match-Kandidat
    const list = byStyle.get(key)
    if (list) list.push(p)
    else byStyle.set(key, [p])
  }

  const out: AssetMatch[] = []
  for (const a of assets) {
    if (!a.model || norm(a.model) === '') continue
    const hits = byStyle.get(norm(a.model)) ?? []
    const kind: MatchKind =
      hits.length === 1 ? 'unique' : hits.length === 0 ? 'none' : 'ambiguous'
    out.push({ asset: a, kind, products: hits })
  }
  return out
}

// ─── DB (nur SELECT) ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || !ORG_ID) {
    console.error(
      'Fehlt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und MATCH_ORG_ID sind erforderlich.',
    )
    process.exit(1)
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(url, serviceKey) as any

  // Optionaler Saison-Filter: Code → season_id auflösen.
  let seasonId: string | null = null
  if (SEASON) {
    const { data: s, error: sErr } = await supabase
      .from('seasons')
      .select('id, code')
      .eq('org_id', ORG_ID)
      .eq('code', SEASON)
      .maybeSingle()
    if (sErr) throw sErr
    if (!s) {
      console.error(`Saison "${SEASON}" für diese Org nicht gefunden.`)
      process.exit(1)
      return
    }
    seasonId = s.id
  }

  // assets lesen (nur die für den Match nötigen Spalten).
  const { data: assets, error: aErr } = await supabase
    .from('assets')
    .select(
      'id, filename, model, color_code, color_name, color_code_2, color_name_2, is_social_media, season_id',
    )
    .eq('org_id', ORG_ID)
  if (aErr) throw aErr

  // products lesen (optional auf Saison eingeschränkt).
  let pQuery = supabase
    .from('products')
    .select('id, style, name, season_id')
    .eq('org_id', ORG_ID)
  if (seasonId) pQuery = pQuery.eq('season_id', seasonId)
  const { data: products, error: pErr } = await pQuery
  if (pErr) throw pErr

  report(assets as AssetRow[], products as ProductRow[])
}

// ─── Report ──────────────────────────────────────────────────────────────────

function report(assets: AssetRow[], products: ProductRow[]): void {
  const withModel = assets.filter((a) => a.model && norm(a.model) !== '')
  const withoutModel = assets.filter((a) => !a.model || norm(a.model) === '')
  const social = assets.filter((a) => a.is_social_media)
  const socialWithModel = social.filter((a) => a.model && norm(a.model) !== '')

  // Style-Duplikate (Ursache möglicher Mehrdeutigkeit) zählen.
  const styleCounts = new Map<string, number>()
  for (const p of products) {
    const k = norm(p.style)
    if (k) styleCounts.set(k, (styleCounts.get(k) ?? 0) + 1)
  }
  const dupStyles = [...styleCounts.entries()].filter(([, n]) => n > 1)

  const matches = matchModels(withModel, products)
  const unique = matches.filter((m) => m.kind === 'unique')
  const none = matches.filter((m) => m.kind === 'none')
  const ambiguous = matches.filter((m) => m.kind === 'ambiguous')

  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log('DRY-RUN: assets ↔ products (model ↔ style) — NUR LESEN')
  console.log(line)
  console.log(`org_id            ${ORG_ID}`)
  console.log(`Saison-Filter     ${SEASON ?? '(keiner — alle Artikel)'}`)
  console.log(`assets gesamt     ${assets.length}`)
  console.log(
    `products gesamt   ${products.length}` +
      (dupStyles.length ? `  (Style-Duplikate: ${dupStyles.length})` : ''),
  )

  console.log(`\nKategorien der Bilder`)
  console.log(`  mit Modell (per Modell zuordenbar)   ${withModel.length}`)
  console.log(`  ohne Modell (nur Farbcode)           ${withoutModel.length}`)
  console.log(`  is_social_media = true               ${social.length}`)
  console.log(`    davon mit Modell                   ${socialWithModel.length}`)

  console.log(`\nMatch auf den ${withModel.length} Bildern mit Modell`)
  console.log(`  eindeutiger Treffer   ${unique.length}`)
  console.log(`  kein Treffer          ${none.length}`)
  console.log(`  mehrdeutig            ${ambiguous.length}`)

  console.log(`\n── Bis zu 5 saubere Treffer (Beispiele) ──`)
  for (const m of unique.slice(0, 5)) {
    console.log(`  ${m.asset.filename}  →  style "${m.products[0].style}"`)
  }
  if (unique.length === 0) console.log('  (keine)')

  console.log(`\n── Alle Nicht-Treffer (Modell ohne passenden Style) ──`)
  for (const m of none) {
    console.log(`  ${m.asset.filename}   (model "${m.asset.model}")`)
  }
  if (none.length === 0) console.log('  (keine)')

  if (ambiguous.length > 0) {
    console.log(`\n── Mehrdeutige (Modell trifft mehrere Styles) ──`)
    for (const m of ambiguous) {
      const styles = m.products.map((p) => p.style).join(', ')
      console.log(`  ${m.asset.filename} (model "${m.asset.model}") → ${styles}`)
    }
  }

  if (dupStyles.length > 0) {
    console.log(`\n── Doppelte Styles in products (Mehrdeutigkeits-Ursache) ──`)
    for (const [k, n] of dupStyles) console.log(`  "${k}" ×${n}`)
  }

  console.log(`\n${line}`)
  console.log('Ende Dry-Run. Es wurde NICHTS geschrieben.')
  console.log(line)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
