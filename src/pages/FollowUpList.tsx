import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFollowUpList, type FollowUpRow } from '../lib/nachfass'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import type { Season } from '../types/asset'
import ExportButtons from '../components/ExportButtons'
import { numify, type ExportColumn } from '../lib/exportFile'
import { useT } from '../i18n'

const pillClass = (active: boolean) =>
  [
    'rounded-full px-3 py-1 text-sm transition-colors',
    active ? 'bg-ink text-cream' : 'border-[0.5px] border-line text-muted hover:text-ink',
  ].join(' ')

const th = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted'
const td = 'px-4 py-2.5 text-sm text-ink align-top'

export default function FollowUpList() {
  const t = useT()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Saisons laden; Default = aktive Saison.
  useEffect(() => {
    listSeasons()
      .then((s) => {
        setSeasons(s)
        setSeasonId((cur) => cur ?? s.find((x) => x.is_active)?.id ?? s[0]?.id ?? null)
      })
      .catch(() => setError(t('followUp.loadError')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!seasonId) return
    let active = true
    setLoading(true)
    setError(null)
    getFollowUpList(seasonId)
      .then((r) => {
        if (active) setRows(r)
      })
      .catch(() => {
        if (active) setError(t('followUp.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  const location = (r: FollowUpRow) => [r.plz, r.city].filter(Boolean).join(' ') || '—'

  const exportColumns: ExportColumn<FollowUpRow>[] = [
    { header: t('followUp.col.dealer'), value: (r) => r.name },
    { header: t('followUp.col.location'), value: (r) => location(r) },
    { header: t('followUp.col.lastSeason'), value: (r) => r.lastSeasonLabel },
    { header: t('followUp.col.revenue'), value: (r) => numify(r.lastRevenue) },
    { header: t('followUp.col.phone'), value: (r) => r.phoneRaw ?? '' },
    { header: t('followUp.col.email'), value: (r) => r.email ?? '' },
    { header: t('followUp.col.note'), value: (r) => r.crmNote ?? '' },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('followUp.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('followUp.subtitle')}</p>
        </div>
        {rows.length > 0 && (
          <ExportButtons
            filenameBase={t('followUp.exportFilename')}
            sheetName={t('followUp.exportSheet')}
            columns={exportColumns}
            rows={rows}
          />
        )}
      </div>

      {/* Saison-Wahl */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t('followUp.season')}</span>
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

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border-[0.5px] border-line bg-card px-4 py-4 text-sm text-muted">
          {t('followUp.empty')}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{t('followUp.count', { n: rows.length })}</p>
          <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
            <table className="w-full">
              <thead className="border-b-[0.5px] border-line bg-card">
                <tr>
                  <th className={th}>{t('followUp.col.dealer')}</th>
                  <th className={th}>{t('followUp.col.location')}</th>
                  <th className={th}>{t('followUp.col.lastSeason')}</th>
                  <th className={`${th} text-right`}>{t('followUp.col.revenue')}</th>
                  <th className={th}>{t('followUp.col.contact')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dealerId} className="border-t-[0.5px] border-line first:border-t-0">
                    <td className={td}>
                      <Link
                        to={`/dealers/${r.dealerId}`}
                        className="font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.crmNote && <p className="mt-0.5 text-xs text-muted">{r.crmNote}</p>}
                    </td>
                    <td className={`${td} text-muted`}>{location(r)}</td>
                    <td className={`${td} text-muted`}>{r.lastSeasonLabel}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      {formatEUR(r.lastRevenue)}
                    </td>
                    <td className={td}>
                      <div className="flex flex-col gap-0.5">
                        {r.waLink ? (
                          <a
                            href={r.waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink underline underline-offset-2 hover:opacity-80"
                          >
                            {t('followUp.whatsapp')}
                          </a>
                        ) : (
                          <span
                            className="text-muted/50"
                            title={t('followUp.noWhatsapp')}
                          >
                            {t('followUp.whatsapp')}
                          </span>
                        )}
                        {r.phoneRaw && (
                          <span className="text-xs text-muted">{r.phoneRaw}</span>
                        )}
                        {r.email && <span className="text-xs text-muted">{r.email}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
