import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getProductionOrder,
  listProductionOrderItems,
  updateProductionNotes,
  updateProductionStatus,
  updateProductionTransportkosten,
  updateProductionItemOrderQuantity,
  getAllocationPreview,
  type AllocationPreviewPosition,
} from '../lib/productionOrders'
import { parseDecimalField, parseIntField } from '../lib/paymentTerms'
import { listSeasons } from '../lib/seasons'
import { getProducer } from '../lib/producers'
import {
  supplierLang,
  supplierOrderRecipients,
  supplierOrderMailText,
  buildMailtoUrl,
} from '../lib/supplierOrderMail'
import GoodsReceiptSection from '../components/GoodsReceiptSection'
import AllocationOverrideSection from '../components/AllocationOverrideSection'
import {
  nextProductionStatus,
  isSupplierOrderLocked,
  type ProductionOrder,
  type ProductionOrderItemWithProduct,
} from '../types/productionOrder'
import type { Producer } from '../types/producer'
import type { Season } from '../types/asset'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Produktions-Status → Übersetzungs-Key. */
function productionStatusKey(status: string): TranslationKey {
  return `production.status.${status}` as TranslationKey
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

export default function ProductionOrderEdit() {
  const { id } = useParams<{ id: string }>()
  const t = useT()

  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [items, setItems] = useState<ProductionOrderItemWithProduct[]>([])
  const [season, setSeason] = useState<Season | null>(null)
  const [producer, setProducer] = useState<Producer | null>(null)
  const [mailBusy, setMailBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [transport, setTransport] = useState('')
  const [transportError, setTransportError] = useState<string | null>(null)

  // Prioritäts-Aufteilung (Modul D): Bestellmengen-Eingaben + Vorschau.
  const [preview, setPreview] = useState<AllocationPreviewPosition[]>([])
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({})
  const [qtyError, setQtyError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [ord, its, seas] = await Promise.all([
        getProductionOrder(id),
        listProductionOrderItems(id),
        listSeasons(),
      ])
      setOrder(ord)
      setItems(its)
      setNotes(ord.notes ?? '')
      setTransport(ord.transportkosten != null ? String(ord.transportkosten) : '')
      setSeason(seas.find((s) => s.id === ord.season_id) ?? null)
      setProducer(ord.producer_id ? await getProducer(ord.producer_id) : null)
      setQtyInputs(
        Object.fromEntries(
          its.map((i) => [i.id, i.order_quantity != null ? String(i.order_quantity) : '']),
        ),
      )
      setPreview(await getAllocationPreview(id))
    } catch {
      setError(t('productionOrderEdit.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const totalQuantity = useMemo(
    () => items.reduce((sum, i) => sum + (i.total_quantity ?? 0), 0),
    [items],
  )

  async function handleAdvanceStatus() {
    if (!order) return
    const next = nextProductionStatus(order.status)
    if (!next) return
    try {
      const updated = await updateProductionStatus(order.id, next)
      setOrder(updated)
    } catch {
      setError(t('common.statusChangeError'))
    }
  }

  /**
   * Bestellung an den Lieferanten: PDF (in dessen Sprache) herunterladen und den
   * Mail-Client mit vorbefüllten Empfängern/Betreff/Body öffnen. Kein echter SMTP
   * — die Nutzerin hängt das heruntergeladene PDF an und verschickt selbst.
   */
  async function handleSupplierMail() {
    if (!order || !producer || !order.supplier_order_number) return
    setMailBusy(true)
    setError(null)
    try {
      const lang = supplierLang(producer.language)
      const [{ buildSupplierOrderPdf }, { supplierOrderPdfLabels }] = await Promise.all([
        import('../lib/pdf'),
        import('../lib/pdfLabels'),
      ])
      const blob = buildSupplierOrderPdf({
        labels: supplierOrderPdfLabels(lang),
        number: order.supplier_order_number,
        date: order.sent_at ?? order.generated_at ?? new Date().toISOString(),
        supplierName: producer.name,
        supplierAddress: producer.address,
        seasonLabel: season?.label ?? null,
        items: items.map((i) => ({
          description: i.product?.name ?? i.modell ?? 'Artikel',
          color: i.color,
          size: i.size,
          // Tatsächliche Bestellmenge (manuell), sonst der Bedarf.
          quantity: i.order_quantity ?? i.total_quantity ?? 0,
        })),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bestellung-${order.supplier_order_number}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      const recipients = supplierOrderRecipients(producer)
      const { subject, body } = supplierOrderMailText({
        orderNumber: order.supplier_order_number,
        lang,
      })
      window.location.href = buildMailtoUrl(recipients, subject, body)
    } catch {
      setError(t('supplierOrder.mailError'))
    } finally {
      setMailBusy(false)
    }
  }

  /** Bestellmenge einer Position speichern (leer = Bedarf; block-statt-raten). */
  async function saveOrderQty(itemId: string) {
    if (!order) return
    const parsed = parseIntField(qtyInputs[itemId] ?? '')
    if (!parsed.ok) {
      setQtyError(t('productionOrderEdit.qtyInvalid'))
      return
    }
    setQtyError(null)
    try {
      await updateProductionItemOrderQuantity(itemId, parsed.value)
      await load()
    } catch (err) {
      setQtyError(err instanceof Error ? err.message : t('common.saveFailed'))
    }
  }

  async function handleNotesBlur() {
    if (!order || notes === (order.notes ?? '')) return
    try {
      await updateProductionNotes(order.id, notes.trim() || null)
      setOrder({ ...order, notes: notes.trim() || null })
    } catch {
      setError(t('common.notesSaveError'))
    }
  }

  /**
   * Transportkosten strikt über parseDecimalField speichern: leer = null
   * (gültig), ungültig → sichtbarer Fehler ohne stilles Verschlucken.
   */
  async function handleTransportBlur() {
    if (!order) return
    const parsed = parseDecimalField(transport)
    if (!parsed.ok) {
      setTransportError(t('productionOrderEdit.transportInvalid'))
      return
    }
    setTransportError(null)
    const current = order.transportkosten != null ? Number(order.transportkosten) : null
    if (parsed.value === current) return
    try {
      await updateProductionTransportkosten(order.id, parsed.value)
      setOrder({ ...order, transportkosten: parsed.value })
    } catch {
      setTransportError(t('productionOrderEdit.transportSaveError'))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (!order)
    return (
      <div className="mx-auto max-w-4xl">
        <Link
          to="/production-orders"
          className="text-sm text-muted hover:text-ink"
        >
          {t('productionOrderEdit.back')}
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? t('productionOrderEdit.notFound')}
        </p>
      </div>
    )

  const next = nextProductionStatus(order.status)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <Link
          to="/production-orders"
          className="text-sm text-muted hover:text-ink"
        >
          {t('productionOrderEdit.back')}
        </Link>
      </div>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {order.supplier_order_number ?? t('productionOrders.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('productionOrderEdit.meta', {
              season: season?.label ?? '—',
              date: formatDate(order.generated_at),
            })}
            {order.sent_at
              ? t('productionOrderEdit.sentSuffix', { date: formatDate(order.sent_at) })
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <span className="text-sm text-muted">
            {t('common.status')}:{' '}
            <span className="font-medium text-ink">
              {t(productionStatusKey(order.status))}
            </span>
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
          >
            {t('common.printPdf')}
          </button>
          {order.supplier_order_number && producer && (
            <button
              type="button"
              onClick={handleSupplierMail}
              disabled={mailBusy}
              className="rounded-md border-[0.5px] border-ink px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
            >
              {t('supplierOrder.mail')}
            </button>
          )}
          {next && (
            <button
              type="button"
              onClick={handleAdvanceStatus}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
            >
              {t('common.setStatus', { status: t(productionStatusKey(next)) })}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      <div className="mb-8 flex flex-col gap-4 print:hidden sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">{t('common.notes')}</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder={t('productionOrderEdit.notesPlaceholder')}
            className={inputClass}
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-56">
          <span className="text-sm text-muted">{t('productionOrderEdit.transport')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            onBlur={handleTransportBlur}
            placeholder={t('productionOrderEdit.transportPlaceholder')}
            className={inputClass}
          />
          {transportError && <span className="text-sm text-red-700">{transportError}</span>}
        </label>
      </div>

      {order.notes && (
        <p className="mb-8 hidden text-sm text-ink print:block">
          {t('common.notePrint', { notes: order.notes })}
        </p>
      )}

      <GoodsReceiptSection productionOrderId={order.id} onChanged={load} />

      <h2 className="mb-3 text-lg font-medium text-ink">
        {t('productionOrderEdit.positions', { count: items.length })}
      </h2>

      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t('common.product')}</th>
              <th className="px-4 py-3 font-medium">{t('common.color')}</th>
              <th className="px-4 py-3 font-medium">{t('common.size')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('productionOrderEdit.col.demand')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('productionOrderEdit.col.orderQty')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  {t('common.noPositions')}
                </td>
              </tr>
            ) : (
              items.map((i) => (
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
                    {(i.total_quantity ?? 0).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {isSupplierOrderLocked(order.status) ? (
                      (i.order_quantity ?? i.total_quantity ?? 0).toLocaleString('de-DE')
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={qtyInputs[i.id] ?? ''}
                        onChange={(e) =>
                          setQtyInputs((prev) => ({ ...prev, [i.id]: e.target.value }))
                        }
                        onBlur={() => saveOrderQty(i.id)}
                        placeholder={String(i.total_quantity ?? 0)}
                        className="w-24 rounded-md border-[0.5px] border-line bg-surface px-2 py-1 text-right text-sm text-ink outline-none focus:border-ink"
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={3} className="px-4 py-3 font-medium">
                {t('common.total')}
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {totalQuantity.toLocaleString('de-DE')}
              </td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {preview
                  .reduce((s, p) => s + p.orderQuantity, 0)
                  .toLocaleString('de-DE')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {qtyError && <p className="mt-2 text-sm text-red-700">{qtyError}</p>}

      {/* Prioritäts-Aufteilung (Vorschau, read-only) — NUR im Entwurf. Ab
          „gesendet" tritt die eingefrorene, übersteuerbare Zuteilung unten an
          ihre Stelle. */}
      {(() => {
        const cut = preview.filter(
          (p) => p.orderQuantity < p.demand && p.allocations.length > 0,
        )
        if (cut.length === 0 || order.status !== 'draft') return null
        return (
          <div className="mt-6">
            <h2 className="mb-1 text-lg font-medium text-ink">
              {t('supplierOrder.allocationTitle')}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {isSupplierOrderLocked(order.status)
                ? t('supplierOrder.allocationHintLocked')
                : t('supplierOrder.allocationHint')}
            </p>
            <div className="flex flex-col gap-4">
              {cut.map((p) => (
                <div
                  key={p.itemId}
                  className="rounded-md border-[0.5px] border-line bg-surface p-3"
                >
                  <div className="mb-2 text-sm font-medium text-ink">
                    {[p.productName, p.color, p.size].filter(Boolean).join(' · ')}
                    {' — '}
                    {t('supplierOrder.allocationOf', {
                      order: p.orderQuantity,
                      demand: p.demand,
                    })}
                  </div>
                  <div className="flex flex-col gap-1">
                    {p.allocations.map((a) => (
                      <div
                        key={a.orderId}
                        className={`flex justify-between text-sm ${
                          a.allocated === 0 ? 'text-muted' : 'text-ink'
                        }`}
                      >
                        <span>{a.dealerName}</span>
                        <span className="whitespace-nowrap">
                          {a.allocated.toLocaleString('de-DE')} / {a.demand.toLocaleString('de-DE')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Eingefrorene Kunden-Zuteilung ansehen/übersteuern (ab „gesendet"). */}
      {id && <AllocationOverrideSection productionOrderId={id} status={order.status} />}
    </div>
  )
}
