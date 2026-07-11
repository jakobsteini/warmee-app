import { useEffect, useMemo, useState } from 'react'
import { listOpenPayments } from '../lib/openPayments'
import { setInvoiceStatus } from '../lib/invoices'
import { formatEUR } from '../lib/money'
import type { InvoiceListRow } from '../types/invoice'
import EmptyState from '../components/EmptyState'

/** Heute als ISO-Kurzdatum (YYYY-MM-DD), für den Fälligkeitsvergleich. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Eine versendete Rechnung ist überfällig, wenn ihr Fälligkeitsdatum vorbei ist. */
function isOverdue(row: InvoiceListRow): boolean {
  return row.due_date !== null && row.due_date < todayIso()
}

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

type Filter = 'all' | 'overdue'

export default function OpenPayments() {
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [payingId, setPayingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await listOpenPayments())
    } catch {
      setError('Offene Posten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleMarkPaid(row: InvoiceListRow) {
    if (
      !window.confirm(
        `Rechnung ${row.invoice_number} als bezahlt markieren?`,
      )
    )
      return
    setPayingId(row.id)
    setError(null)
    try {
      await setInvoiceStatus(row.id, 'paid')
      // Bezahlte Rechnung ist kein offener Posten mehr → aus der Liste nehmen.
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch {
      setError('Rechnung konnte nicht als bezahlt markiert werden.')
    } finally {
      setPayingId(null)
    }
  }

  // Summen über alle offenen Posten (unabhängig vom Filter).
  const totalOpen = useMemo(
    () => rows.reduce((s, r) => s + num(r.total), 0),
    [rows],
  )
  const totalOverdue = useMemo(
    () => rows.filter(isOverdue).reduce((s, r) => s + num(r.total), 0),
    [rows],
  )

  const visible =
    filter === 'overdue' ? rows.filter(isOverdue) : rows

  const pillClass = (active: boolean) =>
    [
      'rounded-full px-3 py-1 text-sm transition-colors',
      active
        ? 'bg-ink text-cream'
        : 'border-[0.5px] border-line text-muted hover:text-ink',
    ].join(' ')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">Offene Posten</h1>
        <p className="mt-1 text-sm text-muted">
          Alle versendeten, noch nicht bezahlten Rechnungen. Eine Rechnung gilt
          als überfällig, sobald das Fälligkeitsdatum überschritten ist.
        </p>
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
          Alle
        </button>
        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className={pillClass(filter === 'overdue')}
        >
          Nur überfällige
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : rows.length === 0 ? (
        <EmptyState actionLabel="Zu den Rechnungen" actionTo="/invoices">
          Hier siehst du alle versendeten, noch nicht bezahlten Rechnungen.
          Aktuell sind keine offen – alle versendeten Rechnungen sind bezahlt.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Rechnungsnummer</th>
                <th className="px-4 py-3 font-medium">Händler</th>
                <th className="px-4 py-3 font-medium">Rechnungsdatum</th>
                <th className="px-4 py-3 font-medium">Fällig am</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Betrag</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr className="border-t-[0.5px] border-line bg-white">
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted"
                  >
                    Keine überfälligen Rechnungen.
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const overdue = isOverdue(r)
                  return (
                    <tr
                      key={r.id}
                      className="border-t-[0.5px] border-line bg-white text-ink"
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
                        {formatDate(r.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs ${
                            overdue
                              ? 'bg-red-700 text-cream'
                              : 'border-[0.5px] border-ink text-ink'
                          }`}
                        >
                          {overdue ? 'Überfällig' : 'Offen'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatEUR(r.total)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(r)}
                          disabled={payingId === r.id}
                          className="text-muted transition-colors hover:text-ink disabled:opacity-50"
                        >
                          {payingId === r.id
                            ? 'Speichert…'
                            : 'Als bezahlt markieren'}
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
                  Gesamtbetrag offen
                  <span className="ml-2 font-normal text-muted">
                    davon überfällig: {formatEUR(totalOverdue)}
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
    </div>
  )
}
