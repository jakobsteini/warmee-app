/**
 * Lieferanten-Order (Nepal), Modul D — Prioritäts-Aufteilung beim Bestellen.
 * Supabase-frei → unter `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 *
 * Wenn die (manuell gesetzte) Bestellmenge einer Position kleiner ist als der
 * Bedarf aus den beitragenden Kunden-Aufträgen, wird die knappe Menge nach
 * Priorität verteilt:
 *   1. Prioritäts-Häkchen an der Order (orders.priority) — true zuerst,
 *   2. dealer_season_priority (kleiner = höher; KEIN Eintrag = ganz hinten),
 *   3. bei Gleichstand geseedter Zufall (reproduzierbar → node --test).
 * Höhere Priorität wird VOLL bedient, der Rest geht (anteilig zuletzt) leer aus.
 *
 * Der Seed wird auf der Sammelbestellung eingefroren (priority_seed), damit
 * Vorschau (Entwurf) und eingefrorene Aufteilung (ab „gesendet") identisch sind.
 */

/** Deterministischer PRNG (mulberry32), 0 ≤ r < 1, aus einem ganzzahligen Seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ein Anspruch auf eine Position aus einem beitragenden Kunden-Auftrag. */
export interface AllocationClaim {
  orderId: string
  dealerId: string
  dealerName: string
  /** Prioritäts-Häkchen an der Order (orders.priority). */
  priorityFlag: boolean
  /** dealer_season_priority (kleiner = höher); null = kein Eintrag → hinten. */
  seasonPriority: number | null
  /** Bestellte Menge dieses Auftrags für die Position (Bedarf). */
  demand: number
}

/** Zuteilung je Anspruch (in Prioritäts-Reihenfolge zurückgegeben). */
export interface AllocationResult {
  orderId: string
  dealerId: string
  dealerName: string
  demand: number
  allocated: number
}

/**
 * Verteilt `capacity` Stück auf die Ansprüche `claims` nach der Prioritätsregel
 * (Häkchen → dealer_season_priority[fehlend=hinten] → geseedter Zufall). Höhere
 * Priorität wird zuerst voll bedient (greedy); Summe der Zuteilungen =
 * min(capacity, Σ demand). Deterministisch für gegebenen (claims, capacity, seed).
 * Rückgabe in der ermittelten Prioritäts-Reihenfolge.
 */
export function allocateByPriority(
  claims: AllocationClaim[],
  capacity: number,
  seed: number,
): AllocationResult[] {
  // Kanonische Ausgangsreihenfolge (orderId) → PRNG-Werte stabil zuweisen,
  // unabhängig von der Eingabereihenfolge.
  const canonical = [...claims].sort((a, b) => a.orderId.localeCompare(b.orderId))
  const rand = mulberry32(seed)
  const rByOrder = new Map<string, number>()
  for (const c of canonical) rByOrder.set(c.orderId, rand())

  const seasonRank = (p: number | null) => (p == null ? Number.POSITIVE_INFINITY : p)

  const ordered = [...canonical].sort((a, b) => {
    // 1) Häkchen zuerst (true vor false).
    if (a.priorityFlag !== b.priorityFlag) return a.priorityFlag ? -1 : 1
    // 2) dealer_season_priority aufsteigend (fehlend = hinten).
    const sa = seasonRank(a.seasonPriority)
    const sb = seasonRank(b.seasonPriority)
    if (sa !== sb) return sa - sb
    // 3) geseedter Zufall (reproduzierbar).
    return (rByOrder.get(a.orderId) as number) - (rByOrder.get(b.orderId) as number)
  })

  let remaining = Math.max(0, Math.floor(capacity))
  return ordered.map((c) => {
    const give = Math.min(Math.max(0, c.demand), remaining)
    remaining -= give
    return {
      orderId: c.orderId,
      dealerId: c.dealerId,
      dealerName: c.dealerName,
      demand: c.demand,
      allocated: give,
    }
  })
}

/** Gesamt-Bedarf einer Anspruchsliste. */
export function totalDemand(claims: AllocationClaim[]): number {
  return claims.reduce((s, c) => s + Math.max(0, c.demand), 0)
}

// Der Order→Lieferung-Split (Verteilung je Order + Hard-Block) lebt jetzt im
// eigenen Kern src/lib/deliverySplit.ts (splitByOrder).
