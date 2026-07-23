import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  searchDealersNearby,
  type NearbySearchResult,
  type NoCoordReason,
} from '../lib/geoSearch'
import { useT } from '../i18n'

const RADII = [25, 50, 100]

const pillClass = (active: boolean) =>
  [
    'rounded-full px-3 py-1 text-sm transition-colors',
    active ? 'bg-ink text-cream' : 'border-[0.5px] border-line text-muted hover:text-ink',
  ].join(' ')

const th = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted'
const td = 'px-4 py-2.5 text-sm text-ink'

export default function DealersNearby() {
  const t = useT()
  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState(50)
  const [result, setResult] = useState<NearbySearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function runSearch(e: FormEvent) {
    e.preventDefault()
    if (query.trim() === '') return
    setLoading(true)
    setError(null)
    try {
      setResult(await searchDealersNearby(query, radius))
      setSearched(true)
    } catch {
      setError(t('nearby.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const reasonLabel = (r: NoCoordReason) =>
    r === 'noZip' ? t('nearby.reason.noZip') : t('nearby.reason.notFound')

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('nearby.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('nearby.subtitle')}</p>
      </div>

      <form onSubmit={runSearch} className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nearby.queryPlaceholder')}
            className="min-w-64 flex-1 rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || query.trim() === ''}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('nearby.search')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t('nearby.radius')}</span>
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={pillClass(radius === r)}
            >
              {t('nearby.km', { n: r })}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!searched ? (
        <p className="text-sm text-muted">{t('nearby.hint')}</p>
      ) : !result || result.origin === null ? (
        <p className="rounded-md border-[0.5px] border-line bg-card px-4 py-4 text-sm text-muted">
          {t('nearby.originNotFound')}
        </p>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-medium text-ink">
              {t('nearby.resultsFor', { place: result.origin.place, plz: result.origin.plz })}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('nearby.count', { n: result.within.length, r: radius })}
            </p>
          </div>

          {result.within.length === 0 ? (
            <p className="rounded-md border-[0.5px] border-line bg-card px-4 py-4 text-sm text-muted">
              {t('nearby.none')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
              <table className="w-full">
                <thead className="border-b-[0.5px] border-line bg-card">
                  <tr>
                    <th className={th}>{t('nearby.col.dealer')}</th>
                    <th className={th}>{t('nearby.col.city')}</th>
                    <th className={`${th} text-right`}>{t('nearby.col.distance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.within.map(({ dealer, distanceKm }) => (
                    <tr key={dealer.id} className="border-t-[0.5px] border-line first:border-t-0">
                      <td className={td}>
                        <Link
                          to={`/dealers/${dealer.id}`}
                          className="font-medium text-ink underline-offset-2 hover:underline"
                        >
                          {dealer.name}
                        </Link>
                        {dealer.crmNote && (
                          <p className="mt-0.5 text-xs text-muted">{dealer.crmNote}</p>
                        )}
                      </td>
                      <td className={`${td} text-muted`}>
                        {[dealer.plz, dealer.city].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                        {t('nearby.km', { n: Math.round(distanceKm) })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Händler ohne Koordinate — sichtbar ausgewiesen, nicht verschluckt. */}
          {result.noCoord.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted">
                {t('nearby.noCoordTitle')}
                <span className="ml-2 text-xs font-normal tabular-nums">
                  {result.noCoord.length}
                </span>
              </h2>
              <div className="overflow-hidden rounded-md border-[0.5px] border-line">
                <ul className="divide-y divide-line">
                  {result.noCoord.map(({ dealer, reason }) => (
                    <li
                      key={dealer.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                    >
                      <Link
                        to={`/dealers/${dealer.id}`}
                        className="text-ink underline-offset-2 hover:underline"
                      >
                        {dealer.name}
                      </Link>
                      <span className="text-xs text-muted">{reasonLabel(reason)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* Datenquelle GeoNames (CC BY 4.0) — Namensnennung laut Lizenz. */}
      <p className="mt-10 border-t-[0.5px] border-line pt-3 text-xs text-muted">
        {t('nearby.attribution')}{' '}
        <a
          href="https://www.geonames.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          GeoNames
        </a>
        , CC BY 4.0
      </p>
    </div>
  )
}
