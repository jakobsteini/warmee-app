import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getDelivery,
  itemKey,
  listDeliveryItems,
  orderedQuantities,
  updateDeliveryItemQuantity,
  updateDeliveryNotes,
  updateDeliveryStatus,
  type DeliveryDetail,
} from '../lib/deliveries'
import {
  createDeliveryNote,
  createInvoice,
  listDeliveryDocuments,
  signedPdfUrl,
} from '../lib/invoices'
import {
  deliveryStatusLabel,
  nextDeliveryStatus,
  type DeliveryItemWithProduct,
} from '../types/delivery'
import {
  invoiceStatusLabel,
  type DeliveryNote,
  type Invoice,
} from '../types/invoice'

/** Datum (ISO) als deutsches Kurzdatum, oder „—". */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function DeliveryEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null)
  const [items, setItems] = useState<DeliveryItemWithProduct[]>([])
  const [ordered, setOrdered] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [docBusy, setDocBusy] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)

  async function loadDocs(deliveryId: string) {
    const docs = await listDeliveryDocuments(deliveryId)
    setInvoices(docs.invoices)
    setDeliveryNotes(docs.deliveryNotes)
  }

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [del, its] = await Promise.all([
        getDelivery(id),
        listDeliveryItems(id),
        loadDocs(id),
      ])
      setDelivery(del)
      setItems(its)
      setNotes(del.notes ?? '')
      // Bestellte Mengen für den Soll/Ist-Abgleich aus den originalen Orders.
      const seasonId = del.production_order?.season_id
      setOrdered(
        seasonId ? await orderedQuantities(seasonId, del.dealer_id) : new Map(),
      )
    } catch {
      setError('Lieferung konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function openPdf(path: string | null) {
    if (!path) return
    try {
      window.open(await signedPdfUrl(path), '_blank', 'noopener')
    } catch {
      setDocError('PDF konnte nicht geöffnet werden.')
    }
  }

  async function handleCreateDeliveryNote() {
    if (!id) return
    setDocBusy(true)
    setDocError(null)
    try {
      const note = await createDeliveryNote(id)
      await loadDocs(id)
      await openPdf(note.pdf_path)
    } catch (err) {
      setDocError(
        err instanceof Error
          ? err.message
          : 'Lieferschein konnte nicht erstellt werden.',
      )
    } finally {
      setDocBusy(false)
    }
  }

  async function handleCreateInvoice() {
    if (!id) return
    setDocBusy(true)
    setDocError(null)
    try {
      const invoice = await createInvoice(id)
      navigate(`/invoices/${invoice.id}`)
    } catch (err) {
      setDocError(
        err instanceof Error
          ? err.message
          : 'Rechnung konnte nicht erstellt werden.',
      )
    } finally {
      setDocBusy(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const totals = useMemo(() => {
    let orderedSum = 0
    let deliveredSum = 0
    for (const i of items) {
      orderedSum += ordered.get(itemKey(i.product_id, i.color, i.size)) ?? 0
      deliveredSum += i.quantity ?? 0
    }
    return { orderedSum, deliveredSum }
  }, [items, ordered])

  async function handleAdvanceStatus() {
    if (!delivery) return
    const next = nextDeliveryStatus(delivery.status)
    if (!next) return
    try {
      const updated = await updateDeliveryStatus(delivery.id, next)
      setDelivery({ ...delivery, status: updated.status })
    } catch {
      setError('Status konnte nicht geändert werden.')
    }
  }

  async function handleNotesBlur() {
    if (!delivery || notes === (delivery.notes ?? '')) return
    try {
      await updateDeliveryNotes(delivery.id, notes.trim() || null)
      setDelivery({ ...delivery, notes: notes.trim() || null })
    } catch {
      setError('Notiz konnte nicht gespeichert werden.')
    }
  }

  /** Lokale Mengenänderung (ohne Persistenz). */
  function patchLocal(itemId: string, quantity: number) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
    )
  }

  /** Liefermenge speichern (onBlur). */
  async function saveQuantity(itemId: string, value: string) {
    try {
      await updateDeliveryItemQuantity(itemId, Number(value) || 0)
    } catch {
      setError('Menge konnte nicht gespeichert werden.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const cellInput =
    'w-full rounded-md border-[0.5px] border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-ink'

  if (loading) return <p className="text-sm text-muted">Lädt…</p>
  if (!delivery)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/deliveries" className="text-sm text-muted hover:text-ink">
          ← Zurück zum Wareneingang
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? 'Lieferung nicht gefunden.'}
        </p>
      </div>
    )

  const next = nextDeliveryStatus(delivery.status)
  const hasActiveInvoice = invoices.some((i) => i.status !== 'cancelled')

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <Link to="/deliveries" className="text-sm text-muted hover:text-ink">
          ← Zurück zum Wareneingang
        </Link>
      </div>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {delivery.dealer?.name ?? 'Lieferung'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Saison {delivery.production_order?.season?.label ?? '—'} · Erstellt am{' '}
            {formatDate(delivery.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <span className="text-sm text-muted">
            Status:{' '}
            <span className="font-medium text-ink">
              {deliveryStatusLabel(delivery.status)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
          >
            Drucken / PDF
          </button>
          {next && (
            <button
              type="button"
              onClick={handleAdvanceStatus}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
            >
              {deliveryStatusLabel(next)} setzen
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      <section className="mb-8 rounded-md border-[0.5px] border-line bg-surface px-5 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-ink">Belege</h2>
            <p className="mt-0.5 text-sm text-muted">
              Lieferschein und Rechnung als PDF für {delivery.dealer?.name ?? 'den Händler'}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={docBusy}
              onClick={handleCreateDeliveryNote}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
            >
              Lieferschein erstellen
            </button>
            <button
              type="button"
              disabled={docBusy || hasActiveInvoice}
              title={
                hasActiveInvoice
                  ? 'Es existiert bereits eine aktive Rechnung. Zuerst stornieren.'
                  : undefined
              }
              onClick={handleCreateInvoice}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Rechnung erstellen
            </button>
          </div>
        </div>

        {docError && (
          <p className="mt-3 text-sm text-red-700">{docError}</p>
        )}

        {(deliveryNotes.length > 0 || invoices.length > 0) && (
          <ul className="mt-4 divide-y divide-line border-t-[0.5px] border-line">
            {deliveryNotes.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-ink">
                  Lieferschein {n.note_number}
                  <span className="ml-2 text-muted">{formatDate(n.note_date)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => openPdf(n.pdf_path)}
                  className="text-muted transition-colors hover:text-ink"
                >
                  PDF öffnen
                </button>
              </li>
            ))}
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-ink">
                  Rechnung {inv.invoice_number}
                  <span className="ml-2 text-muted">
                    {formatDate(inv.invoice_date)} · {invoiceStatusLabel(inv.status)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="text-muted transition-colors hover:text-ink"
                >
                  Öffnen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="mb-8 flex flex-col gap-1.5 print:hidden">
        <span className="text-sm text-muted">Notiz</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Interne Notiz zur Lieferung"
          className={inputClass}
        />
      </label>

      {delivery.notes && (
        <p className="mb-8 hidden text-sm text-ink print:block">
          Notiz: {delivery.notes}
        </p>
      )}

      <h2 className="mb-1 text-lg font-medium text-ink">
        Abgleich ({items.length} Positionen)
      </h2>
      <p className="mb-3 text-sm text-muted print:hidden">
        Bestellt zeigt die ursprüngliche Order. Geliefert ist editierbar für
        Teillieferungen.
      </p>

      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Produkt</th>
              <th className="px-4 py-3 font-medium">Farbe</th>
              <th className="px-4 py-3 font-medium">Größe</th>
              <th className="px-4 py-3 text-right font-medium">Bestellt</th>
              <th className="px-4 py-3 text-right font-medium">Geliefert</th>
              <th className="px-4 py-3 text-right font-medium">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Keine Positionen.
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const orderedQty =
                  ordered.get(itemKey(i.product_id, i.color, i.size)) ?? 0
                const diff = (i.quantity ?? 0) - orderedQty
                return (
                  <tr
                    key={i.id}
                    className="border-t-[0.5px] border-line bg-surface text-ink"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {i.product?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">{i.color ?? '—'}</td>
                    <td className="px-4 py-2.5">{i.size ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {orderedQty.toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-2 w-28">
                      <input
                        type="number"
                        min={0}
                        value={i.quantity}
                        onChange={(e) =>
                          patchLocal(i.id, Number(e.target.value) || 0)
                        }
                        onBlur={(e) => saveQuantity(i.id, e.target.value)}
                        className={`${cellInput} text-right print:hidden`}
                      />
                      <span className="hidden text-right print:block">
                        {(i.quantity ?? 0).toLocaleString('de-DE')}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right whitespace-nowrap ${
                        diff < 0 ? 'text-red-700' : 'text-muted'
                      }`}
                    >
                      {diff > 0 ? '+' : ''}
                      {diff.toLocaleString('de-DE')}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={3} className="px-4 py-3 font-medium">
                Gesamt
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {totals.orderedSum.toLocaleString('de-DE')}
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {totals.deliveredSum.toLocaleString('de-DE')}
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {totals.deliveredSum - totals.orderedSum > 0 ? '+' : ''}
                {(totals.deliveredSum - totals.orderedSum).toLocaleString(
                  'de-DE',
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
