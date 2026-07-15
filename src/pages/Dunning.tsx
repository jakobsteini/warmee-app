import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOverdueWithLevels } from '../lib/dunning'
import { formatEUR } from '../lib/money'
import type { DunningLevel, OverdueInvoiceRow } from '../types/dunning'
import EmptyState from '../components/EmptyState'
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

/** numeric/number robust zu number. */
function num(v: number | string): number {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

export default function Dunning() {
  const t = useT()
  const [levels, setLevels] = useState<DunningLevel[]>([])
  const [rows, setRows] = useState<OverdueInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const dossier = await listOverdueWithLevels()
        setLevels(dossier.levels)
        setRows(dossier.rows)
      } catch {
        setError(t('dunning.loadError'))
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalOverdue = useMemo(
    () => rows.reduce((s, r) => s + num(r.total), 0),
    [rows],
  )

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('dunning.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('dunning.subtitle')}</p>
        </div>
        <Link
          to="/dunning/settings"
          className="shrink-0 text-sm text-muted transition-colors hover:text-ink"
        >
          {t('dunning.toSettings')}
        </Link>
      </div>

      {/* Legende der konfigurierten Stufen, damit „erreichte Stufe" lesbar ist. */}
      {levels.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-xs text-muted">
          {levels.map((l) => (
            <span key={l.id} className="whitespace-nowrap">
              <span className="font-medium text-ink">
                {l.level_number}. {l.label}
              </span>{' '}
              {t('dunning.legendFrom', { days: l.days_after_due })}
              {num(l.fee) > 0 &&
                ` · ${t('dunning.legendFee', { fee: formatEUR(num(l.fee)) })}`}
              {l.triggers_collection && ` · ${t('dunning.collection')}`}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState actionLabel={t('nav.openPayments')} actionTo="/open-payments">
          {t('dunning.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  {t('invoices.col.number')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.dealer')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('openPayments.dueOn')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('dunning.col.daysOverdue')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('dunning.col.stage')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('common.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t-[0.5px] border-line bg-surface text-ink"
                >
                  <td className="px-4 py-3 font-medium">{r.invoice_number}</td>
                  <td className="px-4 py-3">{r.dealer_name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-red-700">
                    {formatDate(r.faellig_iso)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {t('dunning.daysValue', { days: r.days_overdue })}
                  </td>
                  <td className="px-4 py-3">
                    {r.level ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs ${
                            r.level.triggers_collection
                              ? 'bg-red-700 text-cream'
                              : 'border-[0.5px] border-ink text-ink'
                          }`}
                        >
                          {r.level.level_number}. {r.level.label}
                        </span>
                        {r.level.triggers_collection && (
                          <span className="text-xs font-medium text-red-700">
                            {t('dunning.collection')}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">{t('dunning.stageNone')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatEUR(num(r.total))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-line bg-card text-ink">
                <td colSpan={5} className="px-4 py-3 font-medium">
                  {t('dunning.totalOverdue', { count: rows.length })}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {formatEUR(totalOverdue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
