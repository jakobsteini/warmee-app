import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrder, deleteOrder, listOrders } from '../lib/orders'
import { listDealers } from '../lib/dealers'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import { lineTotal, statusLabel, type OrderListRow } from '../types/order'
import type { Dealer } from '../types/dealer'
import type { Season } from '../types/asset'

/** Gesamtsumme einer Order aus ihren Zeilen. */
function orderTotal(order: OrderListRow): number {
  return order.order_items.reduce(
    (sum, i) => sum + lineTotal(i.quantity, i.unit_price),
    0,
  )
}

/** Farbige Status-Badge. */
function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'confirmed'
      ? 'bg-ink text-cream'
      : status === 'submitted'
        ? 'border-[0.5px] border-ink text-ink'
        : 'border-[0.5px] border-line text-muted'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {statusLabel(status)}
    </span>
  )
}

export default function Orders() {
  const navigate = useNavigate()
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
      setError('Orders konnten nicht geladen werden.')
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
      setFormError('Bitte Händler und Saison wählen.')
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
      setFormError('Anlegen fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(order: OrderListRow) {
    const dealerName = order.dealer?.name ?? 'diese Order'
    if (!window.confirm(`Order für „${dealerName}" wirklich löschen?`)) return
    try {
      await deleteOrder(order.id)
      await load()
    } catch {
      setError('Order konnte nicht gelöscht werden.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Orders</h1>
          <p className="mt-1 text-sm text-muted">
            Ordererfassung – Bestellungen je Händler und Saison.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={dealers.length === 0 || seasons.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Neue Order
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted">Noch keine Orders angelegt.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Händler</th>
                <th className="px-4 py-3 font-medium">Saison</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Summe</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-white text-ink transition-colors hover:bg-card"
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
                      Öffnen
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(o)
                      }}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-line bg-card text-ink">
                <td className="px-4 py-3 font-medium" colSpan={3}>
                  Gesamt
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
            <h2 className="mb-4 text-lg font-medium text-ink">Neue Order</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Händler *</span>
                <select
                  required
                  value={form.dealer_id}
                  onChange={(e) =>
                    setForm({ ...form, dealer_id: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">— wählen —</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Saison *</span>
                <select
                  required
                  value={form.season_id}
                  onChange={(e) =>
                    setForm({ ...form, season_id: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">— wählen —</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Notiz</span>
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
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Legt an…' : 'Anlegen & öffnen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
