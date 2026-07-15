import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrder, deleteOrder, listOrders } from '../lib/orders'
import { listDealers } from '../lib/dealers'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import { lineTotal, type OrderListRow } from '../types/order'
import type { Dealer } from '../types/dealer'
import type { Season } from '../types/asset'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Order-Status → Übersetzungs-Key für das Status-Badge. */
function orderStatusKey(status: string): TranslationKey {
  return `order.status.${status}` as TranslationKey
}

/** Gesamtsumme einer Order aus ihren Zeilen. */
function orderTotal(order: OrderListRow): number {
  return order.order_items.reduce(
    (sum, i) => sum + lineTotal(i.quantity, i.unit_price),
    0,
  )
}

/** Farbige Status-Badge. */
function StatusBadge({ status }: { status: string }) {
  const t = useT()
  const tone =
    status === 'confirmed'
      ? 'bg-ink text-cream'
      : status === 'submitted'
        ? 'border-[0.5px] border-ink text-ink'
        : 'border-[0.5px] border-line text-muted'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {t(orderStatusKey(status))}
    </span>
  )
}

export default function Orders() {
  const navigate = useNavigate()
  const t = useT()
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ dealer_id: '', season_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ords, deal, seas] = await Promise.all([
        listOrders(),
        listDealers(),
        listSeasons(),
      ])
      setOrders(ords)
      setDealers(deal)
      setSeasons(seas)
    } catch {
      setError(t('orders.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const grandTotal = useMemo(
    () => orders.reduce((sum, o) => sum + orderTotal(o), 0),
    [orders],
  )

  function openCreate() {
    setForm({
      dealer_id: '',
      season_id: seasons.find((s) => s.is_active)?.id ?? '',
      notes: '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.dealer_id || !form.season_id) {
      setFormError(t('orders.chooseError'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const order = await createOrder({
        dealer_id: form.dealer_id,
        season_id: form.season_id,
        notes: form.notes.trim() || null,
      })
      setFormOpen(false)
      navigate(`/orders/${order.id}`)
    } catch {
      setFormError(t('orders.createError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(order: OrderListRow) {
    const dealerName = order.dealer?.name ?? t('orders.deleteFallbackName')
    if (!window.confirm(t('orders.deleteConfirm', { name: dealerName }))) return
    try {
      await deleteOrder(order.id)
      await load()
    } catch {
      setError(t('orders.deleteError'))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('orders.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('orders.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={dealers.length === 0 || seasons.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('orders.new')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : orders.length === 0 ? (
        <EmptyState
          actionLabel={t('orders.new')}
          onAction={openCreate}
          actionDisabled={dealers.length === 0 || seasons.length === 0}
        >
          {t('orders.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('common.dealer')}</th>
                <th className="px-4 py-3 font-medium">{t('common.season')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('common.lineSum')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-surface text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 font-medium">
                    {o.dealer?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {o.season?.label ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatEUR(orderTotal(o))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/orders/${o.id}`)
                      }}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {t('common.open')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(o)
                      }}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-line bg-card text-ink">
                <td className="px-4 py-3 font-medium" colSpan={3}>
                  {t('common.total')}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {formatEUR(grandTotal)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-medium text-ink">{t('orders.new')}</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('orders.dealerReq')}</span>
                <select
                  required
                  value={form.dealer_id}
                  onChange={(e) =>
                    setForm({ ...form, dealer_id: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">{t('common.select')}</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('common.seasonReq')}</span>
                <select
                  required
                  value={form.season_id}
                  onChange={(e) =>
                    setForm({ ...form, season_id: e.target.value })
                  }
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
                <span className="text-sm text-muted">{t('common.notes')}</span>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={inputClass}
                />
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
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? t('orders.creating') : t('orders.createOpen')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
