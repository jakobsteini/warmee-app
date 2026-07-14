import { useEffect, useState } from 'react'
import { getDashboardStats, type DashboardStats } from '../lib/dashboard'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

interface StatDef {
  key: keyof DashboardStats
  labelKey: TranslationKey
}

const STATS: StatDef[] = [
  { key: 'dealers', labelKey: 'dashboard.stat.dealers' },
  { key: 'assets', labelKey: 'dashboard.stat.assets' },
  { key: 'openOrders', labelKey: 'dashboard.stat.openOrders' },
  { key: 'overdueInvoices', labelKey: 'dashboard.stat.overdueInvoices' },
]

export default function Dashboard() {
  const t = useT()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await getDashboardStats()
        if (active) setStats(data)
      } catch {
        if (active) setError(t('dashboard.error'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">
          {t('dashboard.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('dashboard.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.key}
            className="rounded-md border-[0.5px] border-line bg-card px-6 py-8"
          >
            <div className="text-4xl font-medium tabular-nums text-ink">
              {loading || !stats ? '—' : stats[s.key]}
            </div>
            <div className="mt-2 text-sm text-muted">{t(s.labelKey)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
