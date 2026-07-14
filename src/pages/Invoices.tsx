import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '../lib/invoices'
import { formatEUR } from '../lib/money'
import { type InvoiceListRow } from '../types/invoice'
import { formatDateDE, numify, type ExportColumn } from '../lib/exportFile'
import EmptyState from '../components/EmptyState'
import ExportButtons from '../components/ExportButtons'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Rechnungs-Status → Übersetzungs-Key für das On-Screen-Badge. */
function statusKey(status: string): TranslationKey {
  return `invoice.status.${status}` as TranslationKey
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

/** Datum (ISO) als kurzes TT.MM. (für die kompakte Zahlungsspalte). */
function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  })
}

/**
 * Zahlungszelle: bei bezahlten Rechnungen Datum + Betrag als Badge, bei offenen
 * (Entwurf/Versendet) der offene Betrag, bei stornierten nichts. Konsistent mit
 * dem Zahlungsdialog (paid_at / paid_amount).
 */
function PaymentCell({ inv }: { inv: InvoiceListRow }) {
  const t = useT()
  if (inv.status === 'paid') {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-ink px-2.5 py-0.5 text-xs text-cream">
        {t('invoices.paidOn', { date: formatDateShort(inv.paid_at) })}
        {inv.paid_amount != null && <> · {formatEUR(inv.paid_amount)}</>}
      </span>
    )
  }
  if (inv.status === 'cancelled') {
    return <span className="text-xs text-muted">—</span>
  }
  return (
    <span className="whitespace-nowrap text-xs text-muted">
      {t('invoices.open', { amount: formatEUR(inv.total) })}
    </span>
  )
}

/** Farbige Status-Badge. */
function StatusBadge({ status }: { status: string }) {
  const t = useT()
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
      {t(statusKey(status))}
    </span>
  )
}

/** Status für den Export lesbar (offen/bezahlt/storniert). */
function statusExportLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Entwurf'
    case 'sent':
      return 'Offen'
    case 'paid':
      return 'Bezahlt'
    case 'cancelled':
      return 'Storniert'
    default:
      return status
  }
}

/** Spalten für den Rechnungs-Export (deutsche Überschriften). */
const INVOICE_EXPORT_COLUMNS: ExportColumn<InvoiceListRow>[] = [
  { header: 'Rechnungsnummer', value: (r) => r.invoice_number },
  { header: 'Rechnungsdatum', value: (r) => formatDateDE(r.invoice_date) },
  { header: 'Händler', value: (r) => r.dealer?.name ?? '' },
  { header: 'Netto', value: (r) => numify(r.subtotal) },
  { header: 'USt (20%)', value: (r) => numify(r.tax_amount) },
  { header: 'Brutto', value: (r) => numify(r.total) },
  { header: 'Status', value: (r) => statusExportLabel(r.status) },
  { header: 'Zahlungsdatum', value: (r) => formatDateDE(r.paid_at) },
  { header: 'Bezahlter Betrag', value: (r) => numify(r.paid_amount) },
  { header: 'Fälligkeit', value: (r) => formatDateDE(r.due_date) },
]

export default function Invoices() {
  const navigate = useNavigate()
  const t = useT()
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setInvoices(await listInvoices())
      } catch {
        setError(t('invoices.loadError'))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('invoices.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('invoices.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/invoices/new')}
            className="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
          >
            {t('invoices.free')}
          </button>
          <ExportButtons
            filenameBase="rechnungen"
            sheetName="Rechnungen"
            columns={INVOICE_EXPORT_COLUMNS}
            rows={invoices}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : invoices.length === 0 ? (
        <EmptyState
          actionLabel={t('invoices.emptyAction')}
          actionTo="/deliveries"
        >
          {t('invoices.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  {t('invoices.col.number')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.dealer')}</th>
                <th className="px-4 py-3 font-medium">{t('common.date')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('invoices.col.payment')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('common.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line bg-surface text-ink transition-colors hover:bg-card"
                >
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.dealer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(inv.invoice_date)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentCell inv={inv} />
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
