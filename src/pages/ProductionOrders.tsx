import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteProductionOrder,
  generateProductionOrder,
  listProductionOrders,
} from '../lib/productionOrders'
import { listSeasons } from '../lib/seasons'
import {
  productionStatusLabel,
  type ProductionOrderListRow,
} from '../types/productionOrder'
import EmptyState from '../components/EmptyState'
import type { Season } from '../types/asset'

/** Summe aller Stückzahlen einer Bestellung. */
function orderQuantity(order: ProductionOrderListRow): number {
  return order.production_order_items.reduce(
    (sum, i) => sum + (i.total_quantity ?? 0),
    0,
  )
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
  const tone =
    status === 'received'
      ? 'bg-ink text-cream'
      : status === 'draft'
        ? 'border-[0.5px] border-line text-muted'
        : 'border-[0.5px] border-ink text-ink'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {productionStatusLabel(status)}
    </span>
  )
}

export default function ProductionOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ProductionOrderListRow[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [seasonId, setSeasonId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ords, seas] = await Promise.all([
        listProductionOrders(),
        listSeasons(),
      ])
      setOrders(ords)
      setSeasons(seas)
    } catch {
      setError('Nepal-Bestellungen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const seasonLabel = useMemo(
    () => new Map(seasons.map((s) => [s.id, s.label])),
    [seasons],
  )

  function openGenerate() {
    setSeasonId(seasons.find((s) => s.is_active)?.id ?? '')
    setFormError(null)
    setFormOpen(true)
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    if (!seasonId) {
      setFormError('Bitte eine Saison wählen.')
      return
    }
    setGenerating(true)
    setFormError(null)
    try {
      const order = await generateProductionOrder(seasonId)
      setFormOpen(false)
      navigate(`/nepal-orders/${order.id}`)
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Bestellung konnte nicht generiert werden.',
      )
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(order: ProductionOrderListRow) {
    const label = order.season?.label ?? seasonLabel.get(order.season_id) ?? ''
    if (
      !window.confirm(
        `Nepal-Bestellung${label ? ` für Saison ${label}` : ''} wirklich löschen?`,
      )
    )
      return
    try {
      await deleteProductionOrder(order.id)
      await load()
    } catch {
      setError('Bestellung konnte nicht gelöscht werden.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Nepal-Bestellung</h1>
          <p className="mt-1 text-sm text-muted">
            Bestätigte Orders einer Saison zu einer Produktionsbestellung für
            Nepal zusammenführen.
          </p>
        </div>
        <button
          type="button"
          onClick={openGenerate}
          disabled={seasons.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Bestellung generieren
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
        <EmptyState
          actionLabel="Bestellung generieren"
          onAction={openGenerate}
          actionDisabled={seasons.length === 0}
        >
          Hier führst du die bestätigten Orders einer Saison zu einer
          Produktionsbestellung für Nepal zusammen. Generiere die erste
          Bestellung.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Saison</th>
                <th className="px-4 py-3 font-medium">Generiert am</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">
                  Gesamtstück
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/nepal-orders/${o.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-white text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 font-medium">
                    {o.season?.label ?? seasonLabel.get(o.season_id) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(o.generated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {orderQuantity(o).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/nepal-orders/${o.id}`)
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
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-medium text-ink">
              Bestellung generieren
            </h2>
            <p className="mb-4 text-sm text-muted">
              Alle bestätigten Orders der gewählten Saison werden nach Produkt,
              Farbe und Größe zusammengefasst.
            </p>
            <form onSubmit={handleGenerate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Saison *</span>
                <select
                  required
                  value={seasonId}
                  onChange={(e) => setSeasonId(e.target.value)}
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
                  disabled={generating}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? 'Generiert…' : 'Generieren'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
