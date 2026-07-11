import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteDelivery,
  generateDeliveries,
  listDeliveries,
  listReceivedProductionOrders,
  type ReceivedProductionOrder,
} from '../lib/deliveries'
import { deliveryStatusLabel, type DeliveryListRow } from '../types/delivery'
import EmptyState from '../components/EmptyState'

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
  const tone =
    status === 'delivered'
      ? 'bg-ink text-cream'
      : status === 'pending'
        ? 'border-[0.5px] border-line text-muted'
        : 'border-[0.5px] border-ink text-ink'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {deliveryStatusLabel(status)}
    </span>
  )
}

export default function Deliveries() {
  const navigate = useNavigate()
  const [deliveries, setDeliveries] = useState<DeliveryListRow[]>([])
  const [received, setReceived] = useState<ReceivedProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [productionOrderId, setProductionOrderId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
      setError('Wareneingang konnte nicht geladen werden.')
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
      setFormError('Bitte eine Nepal-Bestellung wählen.')
      return
    }
    setGenerating(true)
    setFormError(null)
    try {
      const created = await generateDeliveries(productionOrderId)
      setFormOpen(false)
      if (created === 0) {
        setError('Keine Lieferungen erstellt — keine passenden Orders gefunden.')
      }
      await load()
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Verteilung konnte nicht generiert werden.',
      )
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(d: DeliveryListRow) {
    const name = d.dealer?.name ?? 'Händler'
    if (!window.confirm(`Lieferung für ${name} wirklich löschen?`)) return
    try {
      await deleteDelivery(d.id)
      await load()
    } catch {
      setError('Lieferung konnte nicht gelöscht werden.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Wareneingang</h1>
          <p className="mt-1 text-sm text-muted">
            Angekommene Nepal-Bestellung anhand der Händlerorders auf die
            einzelnen Händler verteilen.
          </p>
        </div>
        <button
          type="button"
          onClick={openGenerate}
          disabled={received.length === 0}
          title={
            received.length === 0
              ? 'Keine Nepal-Bestellung mit Status „Erhalten"'
              : undefined
          }
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Verteilung generieren
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : deliveries.length === 0 ? (
        <EmptyState
          actionLabel="Verteilung generieren"
          onAction={openGenerate}
          actionDisabled={received.length === 0}
        >
          Hier verteilst du die angekommene Nepal-Bestellung anhand der
          Händlerorders auf die einzelnen Händler. Sobald eine Nepal-Bestellung
          den Status „Erhalten" hat, kannst du die Verteilung erstellen.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Händler</th>
                <th className="px-4 py-3 font-medium">Saison</th>
                <th className="px-4 py-3 font-medium">Erstellt am</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Stück</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/deliveries/${d.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-white text-ink transition-colors hover:bg-card"
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
                      Öffnen
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(d)
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
              Verteilung generieren
            </h2>
            <p className="mb-4 text-sm text-muted">
              Die gewählte Nepal-Bestellung wird anhand der bestätigten
              Händlerorders der Saison auf die Händler aufgeteilt — je Händler
              eine Lieferung.
            </p>
            <form onSubmit={handleGenerate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  Nepal-Bestellung (Status: Erhalten) *
                </span>
                <select
                  required
                  value={productionOrderId}
                  onChange={(e) => setProductionOrderId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— wählen —</option>
                  {received.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.season?.label ?? 'Saison ?'} ·{' '}
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
