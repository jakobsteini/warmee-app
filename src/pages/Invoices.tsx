import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '../lib/invoices'
import { formatEUR } from '../lib/money'
import { invoiceStatusLabel, type InvoiceListRow } from '../types/invoice'
import EmptyState from '../components/EmptyState'

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
    status === 'paid'
      ? 'bg-ink text-cream'
      : status === 'cancelled'
        ? 'border-[0.5px] border-line text-muted line-through'
        : status === 'sent'
          ? 'border-[0.5px] border-ink text-ink'
          : 'border-[0.5px] border-line text-muted'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {invoiceStatusLabel(status)}
    </span>
  )
}

export default function Invoices() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setInvoices(await listInvoices())
      } catch {
        setError('Rechnungen konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">Rechnungen</h1>
        <p className="mt-1 text-sm text-muted">
          Rechnungen werden aus einer Lieferung im Wareneingang erstellt. Die
          Nummer wird fortlaufend und ohne Lücken vergeben.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : invoices.length === 0 ? (
        <EmptyState actionLabel="Zum Wareneingang" actionTo="/deliveries">
          Rechnungen entstehen aus einer Lieferung im Wareneingang. Öffne dort
          eine Lieferung und erstelle die erste Rechnung.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nummer</th>
                <th className="px-4 py-3 font-medium">Händler</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-white text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.dealer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(inv.invoice_date)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatEUR(inv.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
