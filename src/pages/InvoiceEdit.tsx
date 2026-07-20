import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  cancelInvoice,
  getInvoice,
  markInvoicePaid,
  regenerateInvoicePdf,
  setInvoiceStatus,
  signedPdfUrl,
} from '../lib/invoices'
import { formatEUR } from '../lib/money'
import { type InvoiceWithItems } from '../types/invoice'
import {
  loadInvoiceReturnContext,
  createReturn,
  cancelReturn,
} from '../lib/returns'
import { openAfterReturns } from '../lib/returnsCalc'
import type { InvoiceReturnContext, ReturnWithItems } from '../types/return'
import MarkPaidDialog from '../components/MarkPaidDialog'
import {
  ReturnCaptureDialog,
  CancelReturnDialog,
} from '../components/ReturnDialog'
import {
  VAT_RATE_PERCENT,
  computeSkonto,
  effectivePaymentTerms,
} from '../lib/tax'
import { addDaysIso, daysBetweenIso } from '../lib/dates'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Rechnungs-Status → Übersetzungs-Key für das Status-Label. */
function statusKey(status: string): TranslationKey {
  return `invoice.status.${status}` as TranslationKey
}

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
  const t = useT()

  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [returnsCtx, setReturnsCtx] = useState<InvoiceReturnContext | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<ReturnWithItems | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [inv, ctx] = await Promise.all([
        getInvoice(id),
        loadInvoiceReturnContext(id).catch(() => null),
      ])
      setInvoice(inv)
      setReturnsCtx(ctx)
    } catch {
      setError(t('invoiceEdit.loadError'))
    } finally {
      setLoading(false)
    }
  }

  /** Retouren-Kontext nach einer Änderung neu laden (Restmengen + Liste). */
  async function reloadReturns() {
    if (!id) return
    setReturnsCtx(await loadInvoiceReturnContext(id).catch(() => null))
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
      setError(t('common.pdfOpenError'))
    }
  }

  /**
   * PDF FORCE-neu erzeugen (z. B. nach Layout-/Logo-Änderung). Tauscht NUR das
   * PDF im Storage aus — regenerateInvoicePdf rechnet KEINE Steuer/Beträge neu
   * (liest die eingefrorenen tax_rate/tax_amount/tax_note/total aus dem
   * Datensatz und aktualisiert ausschließlich pdf_path). Die Snapshot-Werte der
   * Rechnung bleiben unverändert.
   */
  async function handleRegenerate() {
    if (!invoice) return
    setBusy(true)
    setError(null)
    try {
      const updated = await regenerateInvoicePdf(invoice.id)
      setInvoice({ ...invoice, pdf_path: updated.pdf_path })
      if (updated.pdf_path) {
        window.open(await signedPdfUrl(updated.pdf_path), '_blank', 'noopener')
      }
    } catch {
      setError(t('invoiceEdit.regenerateError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSend() {
    if (!invoice) return
    setBusy(true)
    try {
      const updated = await setInvoiceStatus(invoice.id, 'sent')
      setInvoice({ ...invoice, status: updated.status })
    } catch {
      setError(t('invoiceEdit.statusError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkPaid(paidAt: string, paidAmount: number) {
    if (!invoice) return
    const updated = await markInvoicePaid(invoice.id, paidAt, paidAmount)
    setInvoice({
      ...invoice,
      status: updated.status,
      paid_at: updated.paid_at,
      paid_amount: updated.paid_amount,
    })
    setPayOpen(false)
  }

  async function handleCancel() {
    if (!invoice) return
    if (
      !window.confirm(
        t('invoiceEdit.cancelConfirm', { number: invoice.invoice_number }),
      )
    )
      return
    setBusy(true)
    try {
      const updated = await cancelInvoice(invoice.id)
      setInvoice({ ...invoice, status: updated.status })
    } catch {
      setError(t('invoiceEdit.cancelError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateReturn(payload: {
    lines: { invoice_item_id: string; quantity: number }[]
    return_date: string
    reason: string | null
  }) {
    if (!invoice) return
    await createReturn({ invoice_id: invoice.id, ...payload })
    await reloadReturns()
    setReturnOpen(false)
  }

  async function handleCancelReturn(reason: string) {
    if (!cancelTarget) return
    await cancelReturn(cancelTarget.id, reason)
    await reloadReturns()
    setCancelTarget(null)
  }

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (!invoice)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/invoices" className="text-sm text-muted hover:text-ink">
          {t('invoices.back')}
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? t('invoiceEdit.notFound')}
        </p>
      </div>
    )

  const isCancelled = invoice.status === 'cancelled'
  const isPaid = invoice.status === 'paid'
  const canSend = invoice.status === 'draft'
  const canPay = invoice.status === 'sent'
  const canCancel = invoice.status === 'draft' || invoice.status === 'sent'
  // Retouren gibt es nur zu gelieferter, fakturierter Ware (versendet/bezahlt),
  // nicht zu Entwürfen oder stornierten Rechnungen.
  const returns = returnsCtx?.returns ?? []
  const hasReturnable =
    returnsCtx?.lines.some((l) => l.remaining_quantity > 0) ?? false
  const canReturn = (isPaid || invoice.status === 'sent') && hasReturnable
  // Offener Rest = Rechnungsbrutto − recorded Retouren (zentral über
  // openAfterReturns, wie in der Offene-Posten-Liste). Vorbelegung für die
  // Zahlungserfassung — bei Teilretoure ist der volle Rechnungsbetrag falsch.
  const recordedReturnsGross = returns
    .filter((r) => r.status === 'recorded')
    .reduce((s, r) => s + (Number(r.total_amount) || 0), 0)

  // Zahlungskonditionen aus den EINGEFRORENEN Rechnungswerten (Snapshot wie
  // due_date) — spiegelt die Skonto-Zeile der Rechnungs-PDF. Altbestände ohne
  // Snapshot fallen pro Feld auf den WARM-ME-Standard zurück (wie gedruckt).
  const terms = effectivePaymentTerms({
    skonto_prozent: invoice.skonto_prozent,
    skonto_tage: invoice.skonto_tage,
    zahlungsziel_tage: invoice.due_date
      ? daysBetweenIso(invoice.invoice_date, invoice.due_date)
      : null,
  })
  const totalNum =
    typeof invoice.total === 'string' ? Number(invoice.total) : invoice.total
  const skonto =
    terms.skonto_prozent > 0
      ? computeSkonto(totalNum, terms.skonto_prozent)
      : null
  const skontoDate = addDaysIso(invoice.invoice_date, terms.skonto_tage)

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/invoices" className="text-sm text-muted hover:text-ink">
        {t('invoices.back')}
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('invoiceEdit.title', { number: invoice.invoice_number })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {invoice.dealer?.name ?? '—'} · {formatDate(invoice.invoice_date)}
            {invoice.due_date && (
              <> · {t('invoiceEdit.dueOn', { date: formatDate(invoice.due_date) })}</>
            )}{' '}
            · {t('common.status')}:{' '}
            <span className="font-medium text-ink">
              {t(statusKey(invoice.status))}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
          >
            {t('common.openPdf')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleRegenerate}
            title={t('invoiceEdit.regenerateHint')}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-muted transition-colors hover:bg-card hover:text-ink disabled:opacity-50"
          >
            {t('invoiceEdit.regeneratePdf')}
          </button>
          {canSend && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSend}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t('invoiceEdit.markSent')}
            </button>
          )}
          {canPay && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPayOpen(true)}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t('openPayments.recordPayment')}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={handleCancel}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-red-700 transition-colors hover:bg-card disabled:opacity-50"
            >
              {t('invoiceEdit.cancel')}
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
          {invoice.delivery_id ? (
            <>
              {t('invoiceEdit.cancelledPre')}
              <button
                type="button"
                onClick={() => navigate(`/deliveries/${invoice.delivery_id}`)}
                className="underline hover:text-ink"
              >
                {t('invoiceEdit.cancelledLink')}
              </button>
              {t('invoiceEdit.cancelledPost')}
            </>
          ) : (
            <>{t('invoiceEdit.cancelledFree')}</>
          )}
        </div>
      )}

      {/* Empfänger */}
      <div className="mb-6 rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-muted">
          {t('invoiceEdit.recipient')}
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
              <th className="px-4 py-3 font-medium">{t('common.article')}</th>
              <th className="px-4 py-3 font-medium">{t('common.color')}</th>
              <th className="px-4 py-3 font-medium">{t('common.size')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('common.quantity')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('common.unitPrice')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('common.lineSum')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoice_items.map((i) => (
              <tr
                key={i.id}
                className="border-t-[0.5px] border-line bg-surface text-ink"
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
            <tr className="border-t-[0.5px] border-line bg-surface text-ink">
              <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                {t('invoiceEdit.netAmount')}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatEUR(invoice.subtotal)}
              </td>
            </tr>
            <tr className="bg-surface text-ink">
              <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                {t('common.vat', { percent: VAT_RATE_PERCENT })}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatEUR(invoice.tax_amount)}
              </td>
            </tr>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={5} className="px-4 py-3 text-right font-medium">
                {t('invoiceEdit.grossTotal')}
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {formatEUR(invoice.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isPaid ? (
        <div className="mt-4 rounded-md border-[0.5px] border-ink bg-card px-4 py-3 text-sm text-ink">
          {t('invoiceEdit.paidOn', { date: formatDate(invoice.paid_at) })}
          {invoice.paid_amount != null && (
            <> · {t('invoiceEdit.paidAmount', { amount: formatEUR(invoice.paid_amount) })}</>
          )}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink">
            {t('invoiceEdit.payableWithin', { days: terms.zahlungsziel_tage })}
            {invoice.due_date &&
              ` ${t('invoiceEdit.dueSentence', { date: formatDate(invoice.due_date) })}`}
          </p>
          {skonto && (
            <p className="mt-1 text-sm text-muted">
              {t('invoiceEdit.skontoLine', {
                date: formatDate(skontoDate),
                pct: terms.skonto_prozent,
                amount: formatEUR(skonto.amount),
                payable: formatEUR(skonto.payable),
              })}
            </p>
          )}
        </>
      )}

      {(returns.length > 0 || canReturn) && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-ink">
              {t('returns.section')}
            </h2>
            {canReturn && (
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
              >
                {t('returns.record')}
              </button>
            )}
          </div>

          {returns.length === 0 ? (
            <p className="rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
              {t('returns.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {returns.map((r) => {
                const cancelled = r.status === 'cancelled'
                return (
                  <li
                    key={r.id}
                    className={`rounded-md border-[0.5px] border-line px-4 py-3 text-sm ${
                      cancelled ? 'bg-card text-muted' : 'bg-surface text-ink'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {formatDate(r.return_date)} ·{' '}
                        <span className="font-medium">
                          {formatEUR(r.total_amount)}
                        </span>{' '}
                        ·{' '}
                        {t(
                          cancelled
                            ? 'returns.status.cancelled'
                            : 'returns.status.recorded',
                        )}
                      </span>
                      {!cancelled && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(r)}
                          className="text-red-700 transition-colors hover:text-red-800"
                        >
                          {t('returns.cancel')}
                        </button>
                      )}
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                      {r.return_items.map((it) => (
                        <li key={it.id}>
                          {t('returns.itemLine', {
                            color: it.color ?? '—',
                            size: it.size ?? '—',
                            quantity: it.quantity,
                            price: formatEUR(it.unit_price),
                          })}
                        </li>
                      ))}
                    </ul>
                    {r.reason && !cancelled && (
                      <p className="mt-1 text-xs text-muted">{r.reason}</p>
                    )}
                    {cancelled && r.cancellation_reason && (
                      <p className="mt-1 text-xs text-muted">
                        {t('returns.cancelledWithReason', {
                          reason: r.cancellation_reason,
                        })}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {payOpen && (
        <MarkPaidDialog
          invoiceNumber={invoice.invoice_number}
          defaultAmount={openAfterReturns(totalNum, recordedReturnsGross)}
          skonto={
            terms.skonto_prozent > 0
              ? {
                  prozent: terms.skonto_prozent,
                  tage: terms.skonto_tage,
                  invoiceDate: invoice.invoice_date,
                }
              : null
          }
          onConfirm={handleMarkPaid}
          onClose={() => setPayOpen(false)}
        />
      )}

      {returnOpen && returnsCtx && (
        <ReturnCaptureDialog
          invoiceNumber={invoice.invoice_number}
          lines={returnsCtx.lines}
          onConfirm={handleCreateReturn}
          onClose={() => setReturnOpen(false)}
        />
      )}

      {cancelTarget && (
        <CancelReturnDialog
          amount={cancelTarget.total_amount}
          onConfirm={handleCancelReturn}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  )
}
