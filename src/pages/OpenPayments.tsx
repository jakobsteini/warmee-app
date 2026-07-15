import { useEffect, useMemo, useState } from 'react'
import { listOpenPayments } from '../lib/openPayments'
import { markInvoicePaid } from '../lib/invoices'
import { formatEUR } from '../lib/money'
import { faelligkeitIso, isOverdue, daysOverdue } from '../lib/dueDates'
import type { InvoiceListRow } from '../types/invoice'
import { formatDateDE, numify, type ExportColumn } from '../lib/exportFile'
import EmptyState from '../components/EmptyState'
import MarkPaidDialog from '../components/MarkPaidDialog'
import ExportButtons from '../components/ExportButtons'
import { useT } from '../i18n'

/** numeric/number robust zu number. */
function num(v: number | string | null): number {
  if (v === null || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
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

/** Spalten für den Offene-Posten-Export (deutsche Überschriften). */
const OPEN_PAYMENT_EXPORT_COLUMNS: ExportColumn<InvoiceListRow>[] = [
  { header: 'Rechnungsnummer', value: (r) => r.invoice_number },
  { header: 'Händler', value: (r) => r.dealer?.name ?? '' },
  { header: 'Rechnungsdatum', value: (r) => formatDateDE(r.invoice_date) },
  { header: 'Fällig am', value: (r) => formatDateDE(faelligkeitIso(r)) },
  { header: 'Status', value: (r) => (isOverdue(r) ? 'Überfällig' : 'Offen') },
  { header: 'Offener Betrag', value: (r) => numify(r.total) },
  { header: 'Tage überfällig', value: (r) => daysOverdue(r) },
]

type Filter = 'all' | 'overdue'

export default function OpenPayments() {
  const t = useT()
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [payRow, setPayRow] = useState<InvoiceListRow | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await listOpenPayments())
    } catch {
      setError(t('openPayments.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleMarkPaid(paidAt: string, paidAmount: number) {
    if (!payRow) return
    const id = payRow.id
    setError(null)
    await markInvoicePaid(id, paidAt, paidAmount)
    // Bezahlte Rechnung ist kein offener Posten mehr → aus der Liste nehmen.
    setRows((prev) => prev.filter((r) => r.id !== id))
    setPayRow(null)
  }

  // Summen über alle offenen Posten (unabhängig vom Filter).
  const totalOpen = useMemo(
    () => rows.reduce((s, r) => s + num(r.total), 0),
    [rows],
  )
  const totalOverdue = useMemo(
    () => rows.filter((r) => isOverdue(r)).reduce((s, r) => s + num(r.total), 0),
    [rows],
  )

  const visible =
    filter === 'overdue' ? rows.filter((r) => isOverdue(r)) : rows

  const pillClass = (active: boolean) =>
    [
      'rounded-full px-3 py-1 text-sm transition-colors',
      active
        ? 'bg-ink text-cream'
        : 'border-[0.5px] border-line text-muted hover:text-ink',
    ].join(' ')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('openPayments.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('openPayments.subtitle')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ExportButtons
            filenameBase={
              filter === 'overdue' ? 'offene_posten_ueberfaellig' : 'offene_posten'
            }
            sheetName="Offene Posten"
            columns={OPEN_PAYMENT_EXPORT_COLUMNS}
            rows={visible}
          />
          <p className="text-xs text-muted">
            {t('openPayments.exportNote', {
              scope:
                filter === 'overdue'
                  ? t('openPayments.exportOnlyOverdue')
                  : t('openPayments.exportAllOpen'),
              count: visible.length,
            })}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={pillClass(filter === 'all')}
        >
          {t('common.all')}
        </button>
        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className={pillClass(filter === 'overdue')}
        >
          {t('openPayments.onlyOverdue')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          actionLabel={t('invoices.title')}
          actionTo="/invoices"
        >
          {t('openPayments.empty')}
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
                <th className="px-4 py-3 font-medium">
                  {t('openPayments.dueOn')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {t('common.amount')}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr className="border-t-[0.5px] border-line bg-surface">
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted"
                  >
                    {t('openPayments.noneOverdue')}
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const overdue = isOverdue(r)
                  return (
                    <tr
                      key={r.id}
                      className="border-t-[0.5px] border-line bg-surface text-ink"
                    >
                      <td className="px-4 py-3 font-medium">
                        {r.invoice_number}
                      </td>
                      <td className="px-4 py-3">{r.dealer?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(r.invoice_date)}
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          overdue ? 'font-medium text-red-700' : 'text-muted'
                        }`}
                      >
                        {formatDate(faelligkeitIso(r))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs ${
                            overdue
                              ? 'bg-red-700 text-cream'
                              : 'border-[0.5px] border-ink text-ink'
                          }`}
                        >
                          {overdue
                            ? t('openPayments.overdue')
                            : t('openPayments.open')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatEUR(r.total)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPayRow(r)}
                          className="text-muted transition-colors hover:text-ink"
                        >
                          {t('openPayments.recordPayment')}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-line bg-card text-ink">
                <td colSpan={5} className="px-4 py-3 font-medium">
                  {t('openPayments.totalOpen')}
                  <span className="ml-2 font-normal text-muted">
                    {t('openPayments.ofWhichOverdue', {
                      amount: formatEUR(totalOverdue),
                    })}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {formatEUR(totalOpen)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {payRow && (
        <MarkPaidDialog
          invoiceNumber={payRow.invoice_number}
          defaultAmount={num(payRow.total)}
          onConfirm={handleMarkPaid}
          onClose={() => setPayRow(null)}
        />
      )}
    </div>
  )
}
