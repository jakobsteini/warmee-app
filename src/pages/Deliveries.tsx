import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteDelivery,
  generateDeliveries,
  listDeliveries,
  listReceivedProductionOrders,
  type ReceivedProductionOrder,
} from '../lib/deliveries'
import { type DeliveryListRow } from '../types/delivery'
import type { DistributionShortfall } from '../types/goodsReceipt'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Positions-Label „Produkt · Farbe · Größe" (leere Teile weggelassen). */
function shortfallLabel(s: DistributionShortfall): string {
  return [s.productName, s.color, s.size].filter(Boolean).join(' · ')
}

/** Lieferungs-Status → Übersetzungs-Key. */
function deliveryStatusKey(status: string): TranslationKey {
  return `delivery.status.${status}` as TranslationKey
}

/** Summe aller Liefer-Stückzahlen einer Lieferung. */
function deliveryQuantity(d: DeliveryListRow): number {
  return d.delivery_items.reduce((sum, i) => sum + (i.quantity ?? 0), 0)
}

/** Datum (ISO) als deutsches Kurzdatum, oder „—". */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Farbige Status-Badge. */
function StatusBadge({ status }: { status: string }) {
  const t = useT()
  const tone =
    status === 'delivered'
      ? 'bg-ink text-cream'
      : status === 'pending'
        ? 'border-[0.5px] border-line text-muted'
        : 'border-[0.5px] border-ink text-ink'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {t(deliveryStatusKey(status))}
    </span>
  )
}

export default function Deliveries() {
  const navigate = useNavigate()
  const t = useT()
  const [deliveries, setDeliveries] = useState<DeliveryListRow[]>([])
  const [received, setReceived] = useState<ReceivedProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [productionOrderId, setProductionOrderId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [shortfalls, setShortfalls] = useState<DistributionShortfall[]>([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [dels, recv] = await Promise.all([
        listDeliveries(),
        listReceivedProductionOrders(),
      ])
      setDeliveries(dels)
      setReceived(recv)
    } catch {
      setError(t('deliveries.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openGenerate() {
    setProductionOrderId(received[0]?.id ?? '')
    setFormError(null)
    setFormOpen(true)
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    if (!productionOrderId) {
      setFormError(t('deliveries.chooseProduction'))
      return
    }
    setGenerating(true)
    setFormError(null)
    try {
      const { created, shortfalls: sf } = await generateDeliveries(productionOrderId)
      setFormOpen(false)
      setShortfalls(sf)
      if (created === 0) {
        setError(t('deliveries.noneCreated'))
      }
      await load()
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t('deliveries.generateError'),
      )
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(d: DeliveryListRow) {
    const name = d.dealer?.name ?? t('deliveries.deleteFallbackName')
    if (!window.confirm(t('deliveries.deleteConfirm', { name }))) return
    try {
      await deleteDelivery(d.id)
      await load()
    } catch {
      setError(t('deliveries.deleteError'))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('deliveries.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('deliveries.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openGenerate}
          disabled={received.length === 0}
          title={received.length === 0 ? t('deliveries.noReceivedTitle') : undefined}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('deliveries.generate')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {shortfalls.length > 0 && (
        <div className="mb-4 rounded-md border-[0.5px] border-amber-600/60 bg-amber-50 px-4 py-3 text-sm text-ink">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-amber-800">
              {t('deliveries.shortfall.title')}
            </p>
            <button
              type="button"
              onClick={() => setShortfalls([])}
              className="text-muted transition-colors hover:text-ink"
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {shortfalls.map((s, idx) => (
              <li key={idx} className="text-ink">
                {t('deliveries.shortfall.row', {
                  label: shortfallLabel(s),
                  ordered: s.ordered.toLocaleString('de-DE'),
                  received: s.received.toLocaleString('de-DE'),
                  gap: s.gap.toLocaleString('de-DE'),
                })}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-medium text-amber-800">
            {t('deliveries.shortfall.total', {
              gap: shortfalls
                .reduce((sum, s) => sum + s.gap, 0)
                .toLocaleString('de-DE'),
            })}
          </p>
          <p className="mt-2 text-muted">{t('deliveries.shortfall.priorityHint')}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : deliveries.length === 0 ? (
        <EmptyState
          actionLabel={t('deliveries.generate')}
          onAction={openGenerate}
          actionDisabled={received.length === 0}
        >
          {t('deliveries.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('common.dealer')}</th>
                <th className="px-4 py-3 font-medium">{t('common.season')}</th>
                <th className="px-4 py-3 font-medium">{t('deliveries.col.createdAt')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('deliveries.col.pieces')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/deliveries/${d.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-surface text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 font-medium">
                    {d.dealer?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.production_order?.season?.label ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {deliveryQuantity(d).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/deliveries/${d.id}`)
                      }}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {t('common.open')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(d)
                      }}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
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

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-medium text-ink">
              {t('deliveries.generate')}
            </h2>
            <p className="mb-4 text-sm text-muted">{t('deliveries.dialog.desc')}</p>
            <form onSubmit={handleGenerate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('deliveries.dialog.field')}
                </span>
                <select
                  required
                  value={productionOrderId}
                  onChange={(e) => setProductionOrderId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('common.select')}</option>
                  {received.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.season?.label ?? t('deliveries.dialog.seasonUnknown')} ·{' '}
                      {formatDate(po.generated_at)}
                    </option>
                  ))}
                </select>
              </label>

              {formError && <p className="text-sm text-red-700">{formError}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? t('common.generating') : t('common.generate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
