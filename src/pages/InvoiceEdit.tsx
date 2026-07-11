import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  cancelInvoice,
  getInvoice,
  regenerateInvoicePdf,
  setInvoiceStatus,
  signedPdfUrl,
} from '../lib/invoices'
import { formatEUR } from '../lib/money'
import {
  invoiceStatusLabel,
  KLEINUNTERNEHMER_HINWEIS,
  ZAHLUNGSZIEL_HINWEIS,
  type InvoiceWithItems,
} from '../types/invoice'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function InvoiceEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setInvoice(await getInvoice(id))
    } catch {
      setError('Rechnung konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleDownload() {
    if (!invoice) return
    try {
      let path = invoice.pdf_path
      if (!path) {
        const updated = await regenerateInvoicePdf(invoice.id)
        path = updated.pdf_path
        setInvoice({ ...invoice, pdf_path: path })
      }
      if (!path) return
      window.open(await signedPdfUrl(path), '_blank', 'noopener')
    } catch {
      setError('PDF konnte nicht geöffnet werden.')
    }
  }

  async function handleStatus(next: 'sent' | 'paid') {
    if (!invoice) return
    setBusy(true)
    try {
      const updated = await setInvoiceStatus(invoice.id, next)
      setInvoice({ ...invoice, status: updated.status })
    } catch {
      setError('Status konnte nicht geändert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!invoice) return
    if (
      !window.confirm(
        `Rechnung ${invoice.invoice_number} stornieren? Danach kann für die Lieferung eine neue Rechnung erstellt werden.`,
      )
    )
      return
    setBusy(true)
    try {
      const updated = await cancelInvoice(invoice.id)
      setInvoice({ ...invoice, status: updated.status })
    } catch {
      setError('Rechnung konnte nicht storniert werden.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">Lädt…</p>
  if (!invoice)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/invoices" className="text-sm text-muted hover:text-ink">
          ← Zurück zu den Rechnungen
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? 'Rechnung nicht gefunden.'}
        </p>
      </div>
    )

  const isCancelled = invoice.status === 'cancelled'
  const canSend = invoice.status === 'draft'
  const canPay = invoice.status === 'sent'
  const canCancel = invoice.status === 'draft' || invoice.status === 'sent'

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/invoices" className="text-sm text-muted hover:text-ink">
        ← Zurück zu den Rechnungen
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            Rechnung {invoice.invoice_number}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {invoice.dealer?.name ?? '—'} · {formatDate(invoice.invoice_date)}
            {invoice.due_date && <> · Fällig am {formatDate(invoice.due_date)}</>}{' '}
            · Status:{' '}
            <span className="font-medium text-ink">
              {invoiceStatusLabel(invoice.status)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
          >
            PDF öffnen
          </button>
          {canSend && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStatus('sent')}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Als versendet markieren
            </button>
          )}
          {canPay && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStatus('paid')}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Als bezahlt markieren
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={handleCancel}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-red-700 transition-colors hover:bg-card disabled:opacity-50"
            >
              Stornieren
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isCancelled && (
        <div className="mb-6 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
          Diese Rechnung ist storniert und unveränderlich. Eine neue Rechnung
          kann aus der zugehörigen{' '}
          <button
            type="button"
            onClick={() => navigate(`/deliveries/${invoice.delivery_id}`)}
            className="underline hover:text-ink"
          >
            Lieferung
          </button>{' '}
          erstellt werden.
        </div>
      )}

      {/* Empfänger */}
      <div className="mb-6 rounded-md border-[0.5px] border-line bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-muted">
          Rechnungsempfänger
        </p>
        <p className="mt-1 font-medium text-ink">{invoice.dealer?.name}</p>
        <p className="text-sm text-muted">
          {[
            invoice.dealer?.contact_name,
            [invoice.dealer?.city, invoice.dealer?.country]
              .filter(Boolean)
              .join(', ') || null,
            invoice.dealer?.email,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {/* Positionen */}
      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Artikel</th>
              <th className="px-4 py-3 font-medium">Farbe</th>
              <th className="px-4 py-3 font-medium">Größe</th>
              <th className="px-4 py-3 text-right font-medium">Menge</th>
              <th className="px-4 py-3 text-right font-medium">Einzelpreis</th>
              <th className="px-4 py-3 text-right font-medium">Summe</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoice_items.map((i) => (
              <tr
                key={i.id}
                className="border-t-[0.5px] border-line bg-white text-ink"
              >
                <td className="px-4 py-2.5 font-medium">{i.description}</td>
                <td className="px-4 py-2.5">{i.color ?? '—'}</td>
                <td className="px-4 py-2.5">{i.size ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">{i.quantity}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {formatEUR(i.unit_price)}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {formatEUR(i.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line bg-white text-ink">
              <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                Zwischensumme
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatEUR(invoice.subtotal)}
              </td>
            </tr>
            <tr className="bg-white text-ink">
              <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                USt (0 %)
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatEUR(0)}
              </td>
            </tr>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={5} className="px-4 py-3 text-right font-medium">
                Gesamtsumme
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {formatEUR(invoice.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-4 text-sm text-ink">
        {ZAHLUNGSZIEL_HINWEIS}
        {invoice.due_date && ` Fällig am ${formatDate(invoice.due_date)}.`}
      </p>
      <p className="mt-1 text-sm text-muted italic">
        {KLEINUNTERNEHMER_HINWEIS}
      </p>
    </div>
  )
}
