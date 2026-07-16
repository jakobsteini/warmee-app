import { useEffect, useState, type FormEvent } from 'react'
import {
  getCommissionOverview,
  setCommissionRate,
  listSettlements,
  createSettlement,
  deleteSettlement,
  getLateReturnFlags,
} from '../lib/commission'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import type {
  CommissionOverview,
  CommissionSettlementRow,
} from '../types/commission'
import type { Season } from '../types/asset'
import { useT } from '../i18n'

/** Datum (ISO) als deutsches Kurzdatum, oder „—". */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Dezimalzahl aus String (Dezimalkomma erlaubt) oder null. */
function decOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

/** numeric/number/null → number. */
function num(v: number | string | null): number {
  if (v === null || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

export default function Commission() {
  const t = useT()
  const [overview, setOverview] = useState<CommissionOverview | null>(null)
  const [settlements, setSettlements] = useState<CommissionSettlementRow[]>([])
  // settlement_id → Summe nachträglicher Retouren (nach dem Einfrieren erfasst).
  const [lateFlags, setLateFlags] = useState<Map<string, number>>(new Map())
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rateInput, setRateInput] = useState('')
  const [rateSaving, setRateSaving] = useState(false)

  const [seasonId, setSeasonId] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ov, st, seas] = await Promise.all([
        getCommissionOverview(),
        listSettlements(),
        listSeasons(),
      ])
      setOverview(ov)
      setRateInput(String(ov.ratePercent))
      setSettlements(st)
      setSeasons(seas)
      // Nachträgliche Retouren je Abrechnung (Hinweis-Badge; ändert nichts).
      setLateFlags(
        await getLateReturnFlags(
          st.map((s) => ({
            id: s.id,
            season_id: s.season_id,
            period_from: s.period_from,
            period_to: s.period_to,
            created_at: s.created_at,
          })),
        ).catch(() => new Map<string, number>()),
      )
    } catch {
      setError(t('commission.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveRate() {
    const pct = decOrNull(rateInput)
    if (pct === null || pct < 0 || pct > 100) {
      setError(t('commission.rateInvalid'))
      return
    }
    setRateSaving(true)
    setError(null)
    try {
      await setCommissionRate(pct)
      await load()
    } catch {
      setError(t('commission.rateSaveError'))
    } finally {
      setRateSaving(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!seasonId || !periodFrom || !periodTo) {
      setCreateError(t('commission.createIncomplete'))
      return
    }
    if (periodFrom > periodTo) {
      setCreateError(t('commission.periodOrder'))
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await createSettlement({
        season_id: seasonId,
        period_from: periodFrom,
        period_to: periodTo,
        notes: notes.trim() || null,
      })
      setSeasonId('')
      setPeriodFrom('')
      setPeriodTo('')
      setNotes('')
      await load()
    } catch {
      setCreateError(t('commission.createError'))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(s: CommissionSettlementRow) {
    if (!window.confirm(t('commission.deleteConfirm'))) return
    try {
      await deleteSettlement(s.id)
      await load()
    } catch {
      setError(t('commission.deleteError'))
    }
  }

  const rate = overview?.ratePercent ?? 0

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('commission.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('commission.subtitle')}</p>
      </div>

      {/* Retouren-Hinweis: erklärt, wie Retouren in die Zahlen einfließen. */}
      <div className="mb-6 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
        {t('commission.returnsNotice')}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          {/* Provisionsrate */}
          <section className="mb-8 rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
            <h2 className="text-lg font-medium text-ink">
              {t('commission.rateTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {t('commission.rateHint')}
            </p>
            <div className="mt-3 flex items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t('commission.rateLabel')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className={`${inputClass} w-28`}
                />
              </label>
              <button
                type="button"
                onClick={saveRate}
                disabled={rateSaving}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {rateSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>

          {/* Übersicht pro Saison */}
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium text-ink">
              {t('commission.overviewTitle')}
            </h2>
            <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-card text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('common.season')}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('commission.actualBase')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('commission.deductions')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('commission.actualCommission')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview && overview.seasons.length > 0 ? (
                    overview.seasons.map((s) => (
                      <tr
                        key={s.season_id}
                        className="border-t-[0.5px] border-line bg-surface text-ink"
                      >
                        <td className="px-4 py-3 font-medium">
                          {s.season_label}
                          {s.is_active && (
                            <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted">
                              {t('dealers.priority.current')}
                            </span>
                          )}
                          {s.paymentsWithoutOrder > 0 && (
                            <span
                              className="ml-2 rounded-full border-[0.5px] border-amber-600/60 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                              title={t('commission.noOrderTitle')}
                            >
                              {t('commission.noOrder', {
                                count: s.paymentsWithoutOrder,
                              })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-muted">
                          {formatEUR(s.actualBase)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-muted">
                          {s.deductions > 0 ? `− ${formatEUR(s.deductions)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                          {formatEUR(((s.actualBase - s.deductions) * rate) / 100)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t-[0.5px] border-line bg-surface">
                      <td colSpan={4} className="px-4 py-6 text-center text-muted">
                        {t('commission.noSeasons')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t('commission.overviewNote')}</p>
          </section>

          {/* Abrechnung erstellen */}
          <section className="mb-8 rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
            <h2 className="text-lg font-medium text-ink">
              {t('commission.createTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {t('commission.createHint', { rate })}
            </p>
            <form
              onSubmit={handleCreate}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                <span className="text-xs text-muted">{t('common.seasonReq')}</span>
                <select
                  value={seasonId}
                  onChange={(e) => setSeasonId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('common.select')}</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t('commission.periodFrom')}</span>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t('commission.periodTo')}</span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? t('commission.creating') : t('commission.create')}
              </button>
            </form>
            {createError && (
              <p className="mt-2 text-sm text-red-700">{createError}</p>
            )}
          </section>

          {/* Erstellte Abrechnungen */}
          <section>
            <h2 className="mb-3 text-lg font-medium text-ink">
              {t('commission.settlementsTitle')}
            </h2>
            {settlements.length === 0 ? (
              <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-8 text-center text-sm text-muted">
                {t('commission.noSettlements')}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-card text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('common.season')}</th>
                      <th className="px-4 py-3 font-medium">
                        {t('commission.period')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {t('commission.rateColumn')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {t('commission.deductions')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {t('commission.base')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {t('commission.commission')}
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr
                        key={s.id}
                        className="border-t-[0.5px] border-line bg-surface text-ink"
                      >
                        <td className="px-4 py-3 font-medium">
                          {s.season?.label ?? '—'}
                          {lateFlags.has(s.id) && (
                            <span
                              className="ml-2 rounded-full border-[0.5px] border-amber-600/60 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                              title={t('commission.lateReturnTitle', {
                                amount: formatEUR(lateFlags.get(s.id) ?? 0),
                              })}
                            >
                              {t('commission.lateReturn')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatDate(s.period_from)} – {formatDate(s.period_to)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted whitespace-nowrap">
                          {num(s.rate_percent)} %
                        </td>
                        <td className="px-4 py-3 text-right text-muted whitespace-nowrap">
                          {num(s.deductions) > 0 ? `− ${formatEUR(num(s.deductions))}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-muted whitespace-nowrap">
                          {formatEUR(num(s.net_base))}
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                          {formatEUR(num(s.commission_amount))}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="text-muted transition-colors hover:text-red-700"
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
