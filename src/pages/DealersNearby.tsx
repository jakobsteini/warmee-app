import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  searchDealersNearby,
  searchDealersByLocation,
  type NearbySearchResult,
  type NearbyLocationResult,
  type NoCoordReason,
} from '../lib/geoSearch'
import { formatDistance, telHref, mapsRouteUrl, type LatLng } from '../lib/geoDistance'
import { useT } from '../i18n'

const GEO_RADII = [1, 5, 10, 25] // Standort-Suche: innerstaedtisch fein
const PLZ_RADII = [25, 50, 100] // bestehende PLZ-Suche: unveraendert

const pillClass = (active: boolean) =>
  [
    'rounded-full px-3 py-1.5 text-sm transition-colors',
    active ? 'bg-ink text-cream' : 'border-[0.5px] border-line text-muted hover:text-ink',
  ].join(' ')

const th = 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted'
const td = 'px-4 py-2.5 text-sm text-ink'

export default function DealersNearby() {
  const t = useT()

  // ── Standort-Suche (Geolocation) ──────────────────────────────────────────
  const [geoRadius, setGeoRadius] = useState(10)
  const [geoCoord, setGeoCoord] = useState<LatLng | null>(null)
  const [geoResult, setGeoResult] = useState<NearbyLocationResult | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  async function runGeoSearch(coord: LatLng, radius: number) {
    setGeoLoading(true)
    setGeoError(null)
    try {
      setGeoResult(await searchDealersByLocation(coord, radius))
    } catch {
      setGeoError(t('nearby.loadError'))
    } finally {
      setGeoLoading(false)
    }
  }

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError(t('nearby.geoUnsupported'))
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGeoCoord(coord)
        void runGeoSearch(coord, geoRadius)
      },
      (err) => {
        setGeoLoading(false)
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? t('nearby.geoDenied')
            : t('nearby.geoUnavailable'),
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  function selectGeoRadius(r: number) {
    setGeoRadius(r)
    if (geoCoord) void runGeoSearch(geoCoord, r) // ohne erneute Standortabfrage
  }

  // ── PLZ-Suche (bestehend, unveraendert) ───────────────────────────────────
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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('nearby.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('nearby.subtitle')}</p>
      </div>

      {/* ── Standort-Suche ────────────────────────────────────────────────── */}
      <section className="mb-8 rounded-lg border-[0.5px] border-line bg-card p-4">
        <h2 className="text-sm font-medium text-ink">{t('nearby.geoTitle')}</h2>
        <p className="mt-1 text-xs text-muted">{t('nearby.geoHint')}</p>

        <button
          type="button"
          onClick={requestLocation}
          disabled={geoLoading}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-medium text-cream transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z" />
            <circle cx="12" cy="11" r="2" />
          </svg>
          {geoLoading ? t('nearby.locating') : t('nearby.useLocation')}
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t('nearby.radius')}</span>
          {GEO_RADII.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => selectGeoRadius(r)}
              className={pillClass(geoRadius === r)}
            >
              {t('nearby.km', { n: r })}
            </button>
          ))}
        </div>

        {geoError && (
          <div className="mt-3 rounded-md border-[0.5px] border-line bg-surface px-4 py-3 text-sm text-red-700">
            {geoError}
          </div>
        )}

        {geoResult && !geoError && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-ink">{t('nearby.geoResultsTitle')}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {t('nearby.count', { n: geoResult.within.length, r: geoRadius })}
            </p>

            {geoResult.within.length === 0 ? (
              <p className="mt-3 rounded-md border-[0.5px] border-line bg-surface px-4 py-4 text-sm text-muted">
                {t('nearby.none')}
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {geoResult.within.map(({ dealer, distanceKm, approximate }) => {
                  const tel = telHref(dealer.phone)
                  return (
                    <li
                      key={dealer.id}
                      className="rounded-md border-[0.5px] border-line bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          to={`/dealers/${dealer.id}`}
                          className="font-medium text-ink underline-offset-2 hover:underline"
                        >
                          {dealer.name}
                        </Link>
                        <span className="shrink-0 text-right text-sm tabular-nums text-ink">
                          {formatDistance(distanceKm)}
                          {approximate && (
                            <span
                              title={t('nearby.approximateHint')}
                              className="ml-1 rounded bg-card px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted"
                            >
                              {t('nearby.approximate')}
                            </span>
                          )}
                        </span>
                      </div>

                      <p className="mt-0.5 text-xs text-muted">
                        {[dealer.plz, dealer.city].filter(Boolean).join(' ') || '—'}
                      </p>
                      {dealer.crmNote && (
                        <p className="mt-1 text-xs text-muted">{dealer.crmNote}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {tel && (
                          <a
                            href={tel}
                            className="rounded-md border-[0.5px] border-line px-3 py-2 text-sm text-ink hover:bg-card"
                          >
                            {t('nearby.call')}
                          </a>
                        )}
                        <a
                          href={mapsRouteUrl(dealer.coord)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border-[0.5px] border-line px-3 py-2 text-sm text-ink hover:bg-card"
                        >
                          {t('nearby.route')}
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Haendler ohne Koordinate — sichtbar, nicht verschluckt. */}
            {geoResult.noCoord.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  {t('nearby.noCoordTitle')}
                  <span className="ml-2 font-normal tabular-nums">{geoResult.noCoord.length}</span>
                </h4>
                <ul className="overflow-hidden rounded-md border-[0.5px] border-line">
                  {geoResult.noCoord.map(({ dealer, reason }) => (
                    <li
                      key={dealer.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t-[0.5px] border-line bg-surface px-4 py-2.5 text-sm first:border-t-0"
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
            )}
          </div>
        )}
      </section>

      {/* ── PLZ-Suche (bestehend) ─────────────────────────────────────────── */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
        {t('nearby.orPlz')}
      </h2>

      <form onSubmit={runSearch} className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nearby.queryPlaceholder')}
            className="min-w-64 flex-1 rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
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
          {PLZ_RADII.map((r) => (
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

      {/* Datenquellen-Attribution: GeoNames (PLZ-Zentroide) + OSM (praezise Adressen). */}
      <div className="mt-10 border-t-[0.5px] border-line pt-3 text-xs text-muted">
        <p>
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
        <p className="mt-1">
          {t('nearby.osmAttribution')}{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            openstreetmap.org/copyright
          </a>
        </p>
      </div>
    </div>
  )
}
