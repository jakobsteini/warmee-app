import { useEffect, useState } from 'react'
import {
  getArticleGroupReport,
  type ArticleGroupReport,
  type ArticleGroupReportRow,
} from '../lib/articleGroupsData'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import type { Season } from '../types/asset'
import ExportButtons from '../components/ExportButtons'
import { numify, type ExportColumn } from '../lib/exportFile'
import { useT } from '../i18n'

const pillClass = (active: boolean) =>
  [
    'rounded-full px-3 py-1 text-sm transition-colors',
    active
      ? 'bg-ink text-cream'
      : 'border-[0.5px] border-line text-muted hover:text-ink',
  ].join(' ')

const th = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted'
const td = 'px-4 py-2.5 text-sm text-ink'

export default function ArticleGroupsReport() {
  const t = useT()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<string | 'all'>('all')
  const [data, setData] = useState<ArticleGroupReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSeasons()
      .then(setSeasons)
      .catch(() => {
        /* Filter bleibt bei „Alle" — kein harter Fehler. */
      })
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    getArticleGroupReport(seasonId)
      .then((d) => {
        if (active) setData(d)
      })
      .catch(() => {
        if (active) setError(t('articleGroupsReport.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  /** Gruppenname einer Zeile (ohne-Gruppe lokalisiert). */
  const rowName = (r: ArticleGroupReportRow) =>
    r.name ?? t('articleGroupsReport.ungrouped')

  const exportColumns: ExportColumn<ArticleGroupReportRow>[] = [
    { header: t('articleGroupsReport.col.group'), value: rowName },
    { header: t('articleGroupsReport.col.articles'), value: (r) => r.articleCount },
    { header: t('articleGroupsReport.col.quantity'), value: (r) => r.quantity },
    { header: t('articleGroupsReport.col.net'), value: (r) => numify(r.net) },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('articleGroupsReport.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('articleGroupsReport.subtitle')}
          </p>
        </div>
        {data && data.rows.length > 0 && (
          <ExportButtons
            filenameBase={t('articleGroupsReport.exportFilename')}
            sheetName={t('articleGroupsReport.exportSheet')}
            columns={exportColumns}
            rows={data.rows}
          />
        )}
      </div>

      {/* Saison-Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSeasonId('all')}
          className={pillClass(seasonId === 'all')}
        >
          {t('common.allSeasons')}
        </button>
        {seasons.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeasonId(s.id)}
            className={pillClass(seasonId === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-md border-[0.5px] border-line bg-card px-4 py-4 text-sm text-muted">
          {t('articleGroupsReport.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full">
            <thead className="border-b-[0.5px] border-line bg-card">
              <tr>
                <th className={th}>{t('articleGroupsReport.col.group')}</th>
                <th className={`${th} text-right`}>
                  {t('articleGroupsReport.col.articles')}
                </th>
                <th className={`${th} text-right`}>
                  {t('articleGroupsReport.col.quantity')}
                </th>
                <th className={`${th} text-right`}>
                  {t('articleGroupsReport.col.net')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.id ?? '∅'}
                  className="border-t-[0.5px] border-line first:border-t-0"
                >
                  <td className={`${td} ${r.id === null ? 'text-muted italic' : 'font-medium'}`}>
                    {rowName(r)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.articleCount}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.quantity}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatEUR(r.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-ink bg-card font-medium">
                <td className={td}>{t('articleGroupsReport.total')}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {data.total.articleCount}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {data.total.quantity}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {formatEUR(data.total.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
