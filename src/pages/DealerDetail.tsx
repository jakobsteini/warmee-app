import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadDealerDetail, type DealerDetailData } from '../lib/dealerDetail'
import { formatEUR } from '../lib/money'
import { lineTotal, type OrderListRow } from '../types/order'
import type { DealerEmailRole } from '../types/dealerEmail'
import type { Dealer } from '../types/dealer'
import { signedDocumentUrl } from '../lib/dealerDocuments'
import { listDealerAliases } from '../lib/dealerAliases'
import CollectionBadge from '../components/CollectionBadge'
import DealerEditModal from '../components/DealerEditModal'
import { listSeasons } from '../lib/seasons'
import type { Season } from '../types/asset'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'
import type { DealerDocument } from '../types/dealerDocument'

// ─── kleine Helfer ──────────────────────────────────────────────────────────

/** ISO-Datum als deutsches Kurzdatum, oder Gedankenstrich. */
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Gesamtsumme einer Order aus ihren Zeilen. */
function orderTotal(o: OrderListRow): number {
  return o.order_items.reduce((s, i) => s + lineTotal(i.quantity, i.unit_price), 0)
}

function orderStatusKey(status: string): TranslationKey {
  return `order.status.${status}` as TranslationKey
}
function invoiceStatusKey(status: string): TranslationKey {
  return `invoice.status.${status}` as TranslationKey
}
function deliveryStatusKey(status: string): TranslationKey {
  return `delivery.status.${status}` as TranslationKey
}
function emailRoleKey(role: DealerEmailRole): TranslationKey {
  return `dealerEmail.role.${role}` as TranslationKey
}
function docCategoryKey(cat: DealerDocument['category']): TranslationKey {
  return `dealerDoc.category.${cat}` as TranslationKey
}

// ─── Präsentations-Bausteine ────────────────────────────────────────────────

/** Eine KPI-Kachel: große Zahl oben, Label darunter, optionale Fußzeile. */
function StatTile({
  label,
  value,
  foot,
  footTone = 'muted',
}: {
  label: string
  value: string
  foot?: string
  footTone?: 'muted' | 'danger'
}) {
  return (
    <div className="rounded-md border-[0.5px] border-line bg-card px-5 py-6">
      <div className="text-2xl font-medium tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 text-sm text-muted">{label}</div>
      {foot && (
        <div
          className={`mt-2 text-xs ${footTone === 'danger' ? 'text-red-700' : 'text-muted'}`}
        >
          {foot}
        </div>
      )}
    </div>
  )
}

/** Ein Inhaltsabschnitt mit Titel und optionaler Zählmarke. */
function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium uppercase tracking-wider text-ink">
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-xs font-normal text-muted tabular-nums">{count}</span>
        )}
      </h2>
      <div className="overflow-hidden rounded-md border-[0.5px] border-line bg-surface">
        {children}
      </div>
    </section>
  )
}

/** Farbige Status-Badge (Order/Rechnung/Lieferung teilen den Look). */
function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
      {label}
    </span>
  )
}

function orderTone(status: string): string {
  return status === 'confirmed'
    ? 'bg-ink text-cream'
    : status === 'submitted'
      ? 'border-[0.5px] border-ink text-ink'
      : 'border-[0.5px] border-line text-muted'
}
function invoiceTone(status: string): string {
  return status === 'paid'
    ? 'bg-ink text-cream'
    : status === 'cancelled'
      ? 'border-[0.5px] border-line text-muted line-through'
      : status === 'sent'
        ? 'border-[0.5px] border-ink text-ink'
        : 'border-[0.5px] border-line text-muted'
}
function deliveryTone(status: string): string {
  return status === 'delivered'
    ? 'bg-ink text-cream'
    : status === 'pending'
      ? 'border-[0.5px] border-line text-muted'
      : 'border-[0.5px] border-ink text-ink'
}

/** Leerer Abschnitt: schlichte Zeile statt leerer Tabelle. */
function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-sm text-muted">{children}</p>
}

const thClass = 'px-4 py-2.5 text-left text-xs font-medium text-muted'
const tdClass = 'px-4 py-3 align-top text-ink'

// ─── Seite ──────────────────────────────────────────────────────────────────

export default function DealerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()

  const [data, setData] = useState<DealerDetailData | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [aliases, setAliases] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [detail, seasonList, aliasList] = await Promise.all([
        loadDealerDetail(id),
        listSeasons().catch(() => [] as Season[]),
        // Aliasse sind ergänzend (nur Anzeige) — Fehler soll die Seite nicht kippen.
        listDealerAliases(id).catch(() => []),
      ])
      setData(detail)
      setSeasons(seasonList)
      setAliases(aliasList.map((a) => a.alias))
    } catch {
      setError(t('dealerDetail.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link to="/dealers" className="text-sm text-muted hover:text-ink">
          ← {t('dealerDetail.back')}
        </Link>
        <p className="mt-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error ?? t('dealerDetail.notFound')}
        </p>
      </div>
    )
  }

  const { dealer, credit } = data
  const openAmount = credit?.openAmount ?? 0
  const overdueAmount = credit?.overdueAmount ?? 0
  const refundOpen = credit?.refundOpen ?? 0
  const confirmedCount = data.orders.filter((o) => o.status === 'confirmed').length
  const creditLimit = dealer.credit_limit === null ? null : num(dealer.credit_limit)
  // Rechnungsnummer je Rechnung, für die Inkasso-Historie (die Fälle halten nur
  // invoice_id).
  const invoiceNumberById = new Map(
    data.invoices.map((inv) => [inv.id, inv.invoice_number]),
  )

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── Kopf ── */}
      <Link to="/dealers" className="text-sm text-muted transition-colors hover:text-ink">
        ← {t('dealerDetail.back')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-medium text-ink">{dealer.name}</h1>
            <span className="rounded-full border-[0.5px] border-line px-2.5 py-0.5 text-xs text-muted">
              {t(
                dealer.customer_group === 'b2c'
                  ? 'dealers.group.b2c'
                  : 'dealers.group.b2b',
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              {t('dealers.col.customerNo')}{' '}
              <span className="tabular-nums text-ink">
                {dealer.kundennummer ?? '—'}
              </span>
            </span>
            {(dealer.city || dealer.country) && (
              <span>{[dealer.city, dealer.country].filter(Boolean).join(', ')}</span>
            )}
            {aliases.length > 0 && (
              <span>{t('dealerDetail.aliases', { list: aliases.join(', ') })}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="shrink-0 rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
        >
          {t('common.edit')}
        </button>
      </div>

      {/* ── Kennzahlen: Umsatz / Offen / Orders / Zahlung ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('dealerDetail.kpi.revenue')}
          value={formatEUR(data.revenueTotal)}
        />
        <StatTile
          label={t('dealerDetail.kpi.open')}
          value={formatEUR(openAmount)}
          foot={
            overdueAmount > 0
              ? t('dealerDetail.kpi.overdueSub', { amount: formatEUR(overdueAmount) })
              : undefined
          }
          footTone="danger"
        />
        <StatTile
          label={t('dealerDetail.kpi.orders')}
          value={String(data.orders.length)}
          foot={
            confirmedCount > 0
              ? t('dealerDetail.kpi.ordersConfirmedSub', { count: confirmedCount })
              : undefined
          }
        />
        <StatTile
          label={t('dealerDetail.kpi.payment')}
          value={paymentValue(credit?.avgDelayDays ?? null, t)}
        />
      </div>

      {/* Offene Rückerstattung: umgekehrtes Vorzeichen, bewusst getrennt von der
          „Offen“-Kachel und nur sichtbar, wenn tatsächlich etwas zurückzuzahlen ist. */}
      {refundOpen > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border-[0.5px] border-amber-300 bg-amber-50 px-5 py-3 text-sm">
          <span className="font-medium text-amber-900">
            {t('dealerDetail.refundOpen')}
            <span className="ml-2 font-normal text-amber-700">
              {t('dealerDetail.refundOpenNote')}
            </span>
          </span>
          <span className="font-medium whitespace-nowrap text-amber-900">
            {formatEUR(refundOpen)}
          </span>
        </div>
      )}

      {/* ── Konditionen (eine ruhige Zeile) ── */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border-[0.5px] border-line bg-card px-5 py-3 text-sm">
        <ConditionItem
          label={t('dealers.field.discount')}
          value={`${num(dealer.discount_percent).toString().replace('.', ',')} %`}
        />
        <ConditionItem
          label={t('dealerDetail.field.paymentTerm')}
          value={paymentTermText(dealer, t)}
        />
        <ConditionItem
          label={t('dealerDetail.field.creditLimit')}
          value={
            creditLimit === null
              ? t('dealerDetail.noLimit')
              : t('dealerDetail.creditLimitOf', {
                  open: formatEUR(openAmount),
                  limit: formatEUR(creditLimit),
                })
          }
        />
      </div>

      {/* ── Offene Posten ── */}
      <Section title={t('dealerDetail.section.openItems')} count={data.openItems.length}>
        {data.openItems.length === 0 ? (
          <EmptyRow>{t('dealerDetail.empty.openItems')}</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b-[0.5px] border-line bg-card">
              <tr>
                <th className={thClass}>{t('dealerDetail.col.invoiceNo')}</th>
                <th className={thClass}>{t('dealerDetail.col.due')}</th>
                <th className={`${thClass} text-right`}>{t('dealerDetail.col.amount')}</th>
                <th className={thClass}>{t('dealerDetail.col.overdue')}</th>
                <th className={thClass}>{t('dealerDetail.col.level')}</th>
              </tr>
            </thead>
            <tbody>
              {data.openItems.map((it) => (
                <tr
                  key={it.invoice.id}
                  onClick={() => navigate(`/invoices/${it.invoice.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line transition-colors hover:bg-card"
                >
                  <td className={`${tdClass} font-medium`}>
                    {it.invoice.invoice_number}
                  </td>
                  <td className={`${tdClass} text-muted`}>{fmtDate(it.faelligIso)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatEUR(it.invoice.open_amount)}
                  </td>
                  <td className={tdClass}>
                    {it.daysOverdue !== null ? (
                      <span className="text-red-700">
                        {t('dealerDetail.daysOverdue', { days: it.daysOverdue })}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-muted`}>
                    {it.collection ? (
                      <CollectionBadge />
                    ) : (
                      (it.level?.label ?? '—')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Inkasso-Historie ── */}
      {data.collections.length > 0 && (
        <Section
          title={t('dealerDetail.section.collections')}
          count={data.collections.length}
        >
          <ul className="divide-y divide-line">
            {data.collections.map((c) => {
              const invNo =
                invoiceNumberById.get(c.invoice_id) ?? c.invoice_id.slice(0, 8)
              return (
                <li key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      {c.status === 'active' ? (
                        <CollectionBadge />
                      ) : (
                        <span className="inline-flex items-center rounded-full border-[0.5px] border-line px-2.5 py-0.5 text-xs text-muted">
                          {t('collection.statusWithdrawn')}
                        </span>
                      )}
                      <span className="font-medium text-ink">{invNo}</span>
                    </span>
                    <span className="tabular-nums text-ink">
                      {formatEUR(c.open_amount_snapshot)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t('collection.handedOverOn', {
                      date: fmtDate(c.handed_over_at),
                      level: c.label_snapshot,
                    })}
                  </p>
                  {c.status === 'withdrawn' && (
                    <p className="mt-0.5 text-xs text-muted">
                      {t('collection.withdrawnOn', {
                        date: fmtDate(c.withdrawn_at),
                      })}
                      {c.withdrawal_reason ? ` — ${c.withdrawal_reason}` : ''}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* ── Retouren ── */}
      <Section title={t('returns.section')} count={data.returns.length}>
        {data.returns.length === 0 ? (
          <EmptyRow>{t('returns.empty')}</EmptyRow>
        ) : (
          <ul className="divide-y divide-line">
            {data.returns.map((r) => {
              const cancelled = r.status === 'cancelled'
              // Rechnungs-verankert → Rechnungsnummer; LS-verankert (Kommission) →
              // Kommission; ohne Anker → freie Rechnungskorrektur.
              const invNo = r.invoice_id
                ? (invoiceNumberById.get(r.invoice_id) ?? r.invoice_id.slice(0, 8))
                : r.delivery_note_id
                  ? t('deliveryNote.kommission')
                  : t('correction.free')
              return (
                <li
                  key={r.id}
                  className={`px-4 py-3 text-sm ${cancelled ? 'text-muted' : 'text-ink'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{fmtDate(r.return_date)}</span>
                      <Link
                        to={`/invoices/${r.invoice_id}`}
                        className="font-medium underline transition-colors hover:text-ink"
                      >
                        {invNo}
                      </Link>
                      <span
                        className={`rounded-full border-[0.5px] px-2.5 py-0.5 text-xs ${
                          cancelled ? 'border-line text-muted' : 'border-ink text-ink'
                        }`}
                      >
                        {t(
                          cancelled
                            ? 'returns.status.cancelled'
                            : 'returns.status.recorded',
                        )}
                      </span>
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatEUR(r.total_amount)}
                    </span>
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
      </Section>

      {/* ── Orders ── */}
      <Section title={t('dealerDetail.section.orders')} count={data.orders.length}>
        {data.orders.length === 0 ? (
          <EmptyRow>{t('dealerDetail.empty.orders')}</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b-[0.5px] border-line bg-card">
              <tr>
                <th className={thClass}>{t('dealerDetail.col.season')}</th>
                <th className={thClass}>{t('dealerDetail.col.status')}</th>
                <th className={`${thClass} text-right`}>{t('dealerDetail.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line transition-colors hover:bg-card"
                >
                  <td className={`${tdClass} font-medium`}>{o.season?.label ?? '—'}</td>
                  <td className={tdClass}>
                    <StatusBadge label={t(orderStatusKey(o.status))} tone={orderTone(o.status)} />
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatEUR(orderTotal(o))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Rechnungen ── */}
      <Section title={t('dealerDetail.section.invoices')} count={data.invoices.length}>
        {data.invoices.length === 0 ? (
          <EmptyRow>{t('dealerDetail.empty.invoices')}</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b-[0.5px] border-line bg-card">
              <tr>
                <th className={thClass}>{t('dealerDetail.col.invoiceNo')}</th>
                <th className={thClass}>{t('dealerDetail.col.date')}</th>
                <th className={thClass}>{t('dealerDetail.col.status')}</th>
                <th className={`${thClass} text-right`}>{t('dealerDetail.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line transition-colors hover:bg-card"
                >
                  <td className={`${tdClass} font-medium`}>{inv.invoice_number}</td>
                  <td className={`${tdClass} text-muted`}>{fmtDate(inv.invoice_date)}</td>
                  <td className={tdClass}>
                    <StatusBadge label={t(invoiceStatusKey(inv.status))} tone={invoiceTone(inv.status)} />
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatEUR(inv.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Lieferungen ── */}
      <Section title={t('dealerDetail.section.deliveries')} count={data.deliveries.length}>
        {data.deliveries.length === 0 ? (
          <EmptyRow>{t('dealerDetail.empty.deliveries')}</EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b-[0.5px] border-line bg-card">
              <tr>
                <th className={thClass}>{t('dealerDetail.col.season')}</th>
                <th className={thClass}>{t('dealerDetail.col.status')}</th>
                <th className={`${thClass} text-right`}>{t('dealerDetail.col.pieces')}</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/deliveries/${d.id}`)}
                  className="cursor-pointer border-t-[0.5px] border-line transition-colors hover:bg-card"
                >
                  <td className={`${tdClass} font-medium`}>
                    {d.production_order?.season?.label ?? '—'}
                  </td>
                  <td className={tdClass}>
                    <StatusBadge
                      label={t(deliveryStatusKey(d.status))}
                      tone={deliveryTone(d.status)}
                    />
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {d.delivery_items.reduce((s, i) => s + i.quantity, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Kontakt & Adressen ── */}
      <Section title={t('dealerDetail.section.contact')}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 p-5 sm:grid-cols-2">
          {/* Kontakt + E-Mail-Verteiler */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              {t('dealerDetail.contact.heading')}
            </h3>
            <dl className="flex flex-col gap-1.5 text-sm">
              {dealer.contact_name && (
                <Row label={t('dealers.col.contact')} value={dealer.contact_name} />
              )}
              {dealer.email && <Row label={t('common.email')} value={dealer.email} />}
            </dl>

            <h4 className="mt-4 mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              {t('dealers.section.emails')}
            </h4>
            {data.emails.length === 0 ? (
              <p className="text-sm text-muted">{t('dealers.emails.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.emails.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 break-words">
                    <span className="text-ink">{e.email}</span>
                    <span className="text-xs text-muted">{t(emailRoleKey(e.role))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Adressen */}
          <div className="flex flex-col gap-4">
            <AddressCard title={t('dealers.section.shipping')} lines={shippingLines(dealer)} t={t} />
            <AddressCard title={t('dealers.section.billing')} lines={billingLines(dealer)} t={t} />
            <AddressCard title={t('dealers.section.store')} lines={storeLines(dealer)} t={t} />
          </div>
        </div>
      </Section>

      {/* ── Priorität je Saison ── */}
      <Section title={t('dealerDetail.section.priority')}>
        {data.priorities.length === 0 ? (
          <EmptyRow>{t('dealerDetail.empty.priority')}</EmptyRow>
        ) : (
          <ul className="divide-y divide-line">
            {data.priorities.map((p) => (
              <li
                key={p.seasonId}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-ink">
                  {p.seasonLabel}
                  {p.isActive && (
                    <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted">
                      {t('dealers.priority.current')}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-muted">
                  {t('dealerDetail.priority.value', { n: p.priority })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Dokumente ── */}
      <Section title={t('dealerDetail.section.documents')} count={data.documents.length}>
        {data.documents.length === 0 ? (
          <EmptyRow>{t('dealerDoc.empty')}</EmptyRow>
        ) : (
          <ul className="divide-y divide-line">
            {data.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{doc.file_name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-ink">
                      {t(docCategoryKey(doc.category))}
                    </span>
                    <span className="ml-2">
                      {t('dealerDoc.uploadedBy', { date: fmtDate(doc.created_at) })}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openDoc(doc)}
                  className="shrink-0 text-muted transition-colors hover:text-ink"
                >
                  {t('dealerDoc.download')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editOpen && (
        <DealerEditModal
          dealer={dealer}
          seasons={seasons}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

// ─── weitere Helfer/Bausteine ───────────────────────────────────────────────

/** Zahlungsverhalten als kurzer Text aus dem Ø-Zahlungsverzug. */
function paymentValue(avgDelay: number | null, t: ReturnType<typeof useT>): string {
  if (avgDelay === null) return t('dealerDetail.payment.noData')
  const d = Math.round(avgDelay)
  if (d > 0) return t('dealerDetail.payment.late', { days: d })
  if (d < 0) return t('dealerDetail.payment.early', { days: Math.abs(d) })
  return t('dealerDetail.payment.onTime')
}

/** Zahlungsziel/Skonto als knapper Text (strukturiert, sonst Rohstring). */
function paymentTermText(d: Dealer, t: ReturnType<typeof useT>): string {
  const ziel = d.zahlungsziel_tage
  const sp = d.skonto_prozent === null ? null : num(d.skonto_prozent)
  const parts: string[] = []
  if (ziel === 0) parts.push(t('dealers.terms.netImmediate'))
  else if (ziel !== null) parts.push(t('dealers.terms.net', { days: ziel }))
  else if (d.payment_terms_raw) return d.payment_terms_raw
  else parts.push(t('dealers.terms.net', { days: 30 }))
  if (sp !== null && sp > 0 && d.skonto_tage !== null) {
    parts.push(
      t('dealers.terms.cashDiscount', {
        pct: String(sp).replace('.', ','),
        days: d.skonto_tage,
      }),
    )
  }
  return parts.join(', ')
}

function ConditionItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  )
}

/** Adress-Kärtchen; rendert nichts, wenn keine Zeile Inhalt hat. */
function AddressCard({
  title,
  lines,
  t,
}: {
  title: string
  lines: string[]
  t: ReturnType<typeof useT>
}) {
  const filled = lines.filter((l) => l.trim() !== '')
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
        {title}
      </h4>
      {filled.length === 0 ? (
        <p className="text-sm text-muted">{t('dealerDetail.empty.address')}</p>
      ) : (
        <address className="text-sm not-italic text-ink">
          {filled.map((l, i) => (
            <div key={i} className="break-words">
              {l}
            </div>
          ))}
        </address>
      )}
    </div>
  )
}

function joinCityLine(zip: string | null, city: string | null): string {
  return [zip, city].filter(Boolean).join(' ')
}

function shippingLines(d: Dealer): string[] {
  return [
    d.shipping_name ?? '',
    d.shipping_street ?? '',
    joinCityLine(d.shipping_zip, d.shipping_city),
    d.shipping_country_name ?? '',
    d.shipping_phone ?? '',
    d.shipping_email ?? '',
  ]
}
function billingLines(d: Dealer): string[] {
  return [
    d.billing_name ?? '',
    d.billing_street ?? '',
    joinCityLine(d.billing_zip, d.billing_city),
    d.billing_country_name ?? '',
    d.billing_phone ?? '',
    d.billing_email ?? '',
  ]
}
function storeLines(d: Dealer): string[] {
  return [
    d.store_name ?? '',
    d.store_street ?? '',
    joinCityLine(d.store_zip, d.store_city),
    d.store_country_name ?? '',
    d.store_phone ?? '',
    d.store_email ?? '',
  ]
}

/** Dokument über eine Signed URL öffnen (best effort). */
async function openDoc(doc: DealerDocument) {
  try {
    window.open(await signedDocumentUrl(doc.storage_path), '_blank', 'noopener')
  } catch {
    /* still — der Nutzer kann es erneut versuchen */
  }
}
