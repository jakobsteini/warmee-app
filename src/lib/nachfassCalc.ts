/**
 * Saison-Nachfass-Liste — reine Rechenkerne (supabase-frei, `node --test`).
 *  (a) Saison-Chronologie aus dem Code (SS/FW + Jahr),
 *  (b) Bestimmung „Bestandskunde ohne (bestätigte) Order in Saison X",
 *  (c) WhatsApp-Nachricht DE/EN.
 */

/**
 * Chronologie-Schlüssel aus dem Saison-Code: `(SS|FW|AW)YY` → year*10 + Halbjahr
 * (SS = Frühjahr/Sommer vor FW/AW = Herbst/Winter desselben Jahres). Größer =
 * später. Unparsbar → null (der Aufrufer nutzt dann einen Fallback, z. B.
 * created_at). Beispiel: FW25=255 < FW26=265 < SS27=270.
 */
export function seasonChronoKey(code: string | null | undefined): number | null {
  const m = /^\s*(SS|FW|AW|HW)\s*(\d{2})\s*$/i.exec(code ?? '')
  if (!m) return null
  const half = m[1].toUpperCase() === 'SS' ? 0 : 5
  const year = Number.parseInt(m[2], 10)
  return year * 10 + half
}

export interface SeasonRef {
  id: string
  code: string
  label: string
  /** Fallback-Ordnung, wenn der Code nicht parsbar ist (z. B. created_at ms). */
  fallbackOrder?: number
}

/** Eine bestätigte Order-Aggregation je (Händler, Saison) mit Netto-Umsatz. */
export interface DealerSeasonRevenue {
  dealerId: string
  seasonId: string
  revenue: number
}

/** Ein Nachfass-Kandidat: Bestandskunde ohne Order in der Zielsaison. */
export interface FollowUpDealer {
  dealerId: string
  lastSeasonId: string
  lastSeasonLabel: string
  lastRevenue: number
}

/** Vergleichswert einer Saison (parsed Chrono, sonst Fallback ans Ende/■). */
function chronoValue(s: SeasonRef): number {
  const k = seasonChronoKey(s.code)
  if (k !== null) return k
  // Unparsbar: Fallback-Order (klein) hinter allen parsbaren einsortieren wäre
  // riskant → wir nutzen fallbackOrder direkt (created_at ms skaliert), sodass
  // zumindest eine stabile Reihenfolge herauskommt.
  return s.fallbackOrder ?? -1
}

/**
 * Bestandskunden ohne (bestätigte) Order in der Zielsaison bestimmen: Händler,
 * die in mindestens einer CHRONOLOGISCH FRÜHEREN Saison eine bestätigte Order
 * hatten, aber KEINE in der Zielsaison. „Letzte Saison mit Order" = die
 * jüngste Saison (max. Chrono) unter allen bestätigten Orders des Händlers.
 * Sortiert nach Umsatz dieser letzten Saison absteigend (die wichtigsten zuerst).
 */
export function computeFollowUpDealers(
  seasons: SeasonRef[],
  targetSeasonId: string,
  orders: DealerSeasonRevenue[],
): FollowUpDealer[] {
  const target = seasons.find((s) => s.id === targetSeasonId)
  if (!target) return []
  const targetChrono = chronoValue(target)
  const seasonById = new Map(seasons.map((s) => [s.id, s]))

  // Orders je Händler sammeln.
  const byDealer = new Map<string, DealerSeasonRevenue[]>()
  for (const o of orders) {
    const list = byDealer.get(o.dealerId) ?? []
    list.push(o)
    byDealer.set(o.dealerId, list)
  }

  const out: FollowUpDealer[] = []
  for (const [dealerId, list] of byDealer) {
    const hasTarget = list.some((o) => o.seasonId === targetSeasonId)
    if (hasTarget) continue
    // Mindestens eine chronologisch frühere Order?
    const hasEarlier = list.some((o) => {
      const s = seasonById.get(o.seasonId)
      return s ? chronoValue(s) < targetChrono : false
    })
    if (!hasEarlier) continue
    // Letzte Saison mit Order (max Chrono) unter allen Orders des Händlers.
    let best: { o: DealerSeasonRevenue; chrono: number } | null = null
    for (const o of list) {
      const s = seasonById.get(o.seasonId)
      if (!s) continue
      const c = chronoValue(s)
      if (!best || c > best.chrono) best = { o, chrono: c }
    }
    if (!best) continue
    const s = seasonById.get(best.o.seasonId)!
    out.push({
      dealerId,
      lastSeasonId: best.o.seasonId,
      lastSeasonLabel: s.label,
      lastRevenue: best.o.revenue,
    })
  }

  return out.sort(
    (a, b) => b.lastRevenue - a.lastRevenue || a.dealerId.localeCompare(b.dealerId),
  )
}

export type FollowUpLang = 'de' | 'en'

/** Belegsprache eines Händlers → 'en' nur bei 'en', sonst 'de'. */
export function followUpLang(language: string | null | undefined): FollowUpLang {
  return language === 'en' ? 'en' : 'de'
}

/**
 * Vorbereiteter WhatsApp-Text in Kundensprache, Händlername eingesetzt. Bewusst
 * freundlich-knapp; die Mitarbeiterin passt vor dem Senden ggf. an.
 */
export function followUpMessage(
  lang: FollowUpLang,
  data: { dealerName: string; seasonLabel: string },
): string {
  const name = data.dealerName.trim() || (lang === 'en' ? 'there' : 'Team')
  if (lang === 'en') {
    return (
      `Hello ${name}, this is WARM ME. ` +
      `We're starting into the new season and didn't want to miss you — ` +
      `may we show you our current collection? Warm regards, WARM ME`
    )
  }
  return (
    `Hallo ${name}, hier ist WARM ME. ` +
    `Wir starten in die neue Saison und wollten uns bei Ihnen melden — ` +
    `dürfen wir Ihnen unsere aktuelle Kollektion zeigen? Herzliche Grüße, WARM ME`
  )
}
