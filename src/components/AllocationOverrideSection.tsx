import { useCallback, useEffect, useState } from 'react'
import {
  getAllocationOverrideView,
  saveAllocationOverride,
  type AllocationOverrideView,
  type AllocationOverridePosition,
} from '../lib/productionOrders'
import { parseIntField } from '../lib/paymentTerms'
import { allocationRemaining, isWithinCapacity } from '../lib/allocationOverrideCalc'
import { useT } from '../i18n'

/** Stabiler Positions-Schlüssel für den lokalen Eingabe-State. */
function posKey(p: { productId: string | null; color: string | null; size: string | null }) {
  return [p.productId ?? '∅', p.color ?? '∅', p.size ?? '∅'].join('|')
}

/** ISO → deutsches Kurzdatum. */
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Kunden-Zuteilung einer Sammelbestellung ansehen und (solange erlaubt) manuell
 * übersteuern. Die Summe je Position darf die verfügbare Menge NIE überschreiten
 * (harte Grenze, Block-statt-raten); „noch zu verteilen" wird live gezeigt.
 * Rendert nichts, wenn kein eingefrorener Snapshot existiert (Entwurf).
 */
export default function AllocationOverrideSection({
  productionOrderId,
  status,
}: {
  productionOrderId: string
  status: string
}) {
  const t = useT()
  const [view, setView] = useState<AllocationOverrideView | null>(null)
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const v = await getAllocationOverrideView(productionOrderId).catch(() => null)
    if (!v) return
    setView(v)
    const next: Record<string, Record<string, string>> = {}
    for (const p of v.positions) {
      next[posKey(p)] = Object.fromEntries(
        p.rows.map((r) => [r.orderId, String(r.allocatedQuantity)]),
      )
    }
    setInputs(next)
    setErrors({})
  }, [productionOrderId])

  // Neu laden, wenn sich der Status ändert (z. B. nach „gesendet").
  useEffect(() => {
    reload()
  }, [reload, status])

  if (!view || view.positions.length === 0) return null

  /** Geparste Mengen einer Position (invalid → null). */
  function parsedLines(p: AllocationOverridePosition) {
    const map = inputs[posKey(p)] ?? {}
    const lines: { allocationId: string; orderId: string; quantity: number }[] = []
    for (const r of p.rows) {
      const parsed = parseIntField(map[r.orderId] ?? '')
      if (!parsed.ok) return null
      lines.push({ allocationId: r.allocationId, orderId: r.orderId, quantity: parsed.value ?? 0 })
    }
    return lines
  }

  async function savePosition(p: AllocationOverridePosition) {
    const k = posKey(p)
    const lines = parsedLines(p)
    if (!lines) {
      setErrors((e) => ({ ...e, [k]: t('allocOverride.invalid') }))
      return
    }
    if (!isWithinCapacity(p.capacity, lines)) {
      const over = lines.reduce((s, l) => s + l.quantity, 0) - p.capacity
      setErrors((e) => ({ ...e, [k]: t('allocOverride.over', { n: over }) }))
      return
    }
    setSavingKey(k)
    try {
      await saveAllocationOverride(
        productionOrderId,
        { productId: p.productId, color: p.color, size: p.size },
        lines.map((l) => ({ allocationId: l.allocationId, quantity: l.quantity })),
      )
      setErrors((e) => ({ ...e, [k]: null }))
      await reload()
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [k]: err instanceof Error ? err.message : t('allocOverride.saveError'),
      }))
    } finally {
      setSavingKey(null)
    }
  }

  /** Live-Restmenge einer Position aus den aktuellen Eingaben (null = invalid). */
  function liveRemaining(p: AllocationOverridePosition): number | null {
    const map = inputs[posKey(p)] ?? {}
    const lines: { quantity: number }[] = []
    for (const r of p.rows) {
      const parsed = parseIntField(map[r.orderId] ?? '')
      if (!parsed.ok) return null
      lines.push({ quantity: parsed.value ?? 0 })
    }
    return allocationRemaining(p.capacity, lines)
  }

  return (
    <div className="mt-6">
      <h2 className="mb-1 text-lg font-medium text-ink">{t('allocOverride.title')}</h2>
      <p className="mb-3 text-sm text-muted">
        {view.open ? t('allocOverride.hintOpen') : t('allocOverride.hintLocked')}
      </p>

      <div className="flex flex-col gap-4">
        {view.positions.map((p) => {
          const k = posKey(p)
          const remaining = liveRemaining(p)
          const err = errors[k]
          return (
            <div key={k} className="rounded-md border-[0.5px] border-line bg-surface p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {[p.productName, p.color, p.size].filter(Boolean).join(' · ')}
                </span>
                <span className="text-xs text-muted">
                  {t('allocOverride.available', { n: p.capacity })}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {p.rows.map((r) => (
                  <div key={r.allocationId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      {r.dealerName}
                      {r.isOverridden && (
                        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted">
                          {t('allocOverride.overriddenBadge', { date: fmtDate(r.overriddenAt) })}
                        </span>
                      )}
                    </span>
                    {view.open ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={inputs[k]?.[r.orderId] ?? ''}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [k]: { ...prev[k], [r.orderId]: e.target.value },
                          }))
                        }
                        onBlur={() => savePosition(p)}
                        disabled={savingKey === k}
                        className="w-20 rounded-md border-[0.5px] border-line bg-surface px-2 py-1 text-right text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
                      />
                    ) : (
                      <span className="tabular-nums text-ink">{r.allocatedQuantity}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rest / Überschreitung live */}
              <div className="mt-2 text-xs">
                {err ? (
                  <span className="text-red-700">{err}</span>
                ) : remaining === null ? (
                  <span className="text-red-700">{t('allocOverride.invalid')}</span>
                ) : remaining < 0 ? (
                  <span className="text-red-700">
                    {t('allocOverride.over', { n: -remaining })}
                  </span>
                ) : remaining === 0 ? (
                  <span className="text-muted">{t('allocOverride.fullyAllocated')}</span>
                ) : (
                  <span className="text-amber-700">
                    {t('allocOverride.remaining', { n: remaining })}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
