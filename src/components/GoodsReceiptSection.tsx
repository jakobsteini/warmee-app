import { useEffect, useMemo, useState } from 'react'
import {
  createGoodsReceipt,
  deleteGoodsReceipt,
  getReconciliation,
  listGoodsReceipts,
} from '../lib/goodsReceipts'
import type {
  GoodsReceiptWithItems,
  ReconciliationRow,
} from '../types/goodsReceipt'
import { useT } from '../i18n'

/** Datum (ISO) als deutsches Kurzdatum, oder „—". */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Positions-Label „Produkt · Farbe · Größe" (leere Teile weggelassen). */
function rowLabel(r: ReconciliationRow): string {
  return [r.productName, r.color, r.size].filter(Boolean).join(' · ')
}

/** Summe der Positionsmengen eines Wareneingangs. */
function receiptTotal(r: GoodsReceiptWithItems): number {
  return r.goods_receipt_items.reduce((sum, i) => sum + (i.quantity ?? 0), 0)
}

/**
 * Wareneingang je Produktionsbestellung: erfassen (Teillieferungen möglich),
 * bestehende Wareneingänge auflisten und den Abgleich Wareneingang ↔ Verteilung
 * zeigen (bestellt → eingegangen → verteilt → Rest).
 *
 * `onChanged` wird nach Erfassen/Löschen aufgerufen, damit die übergeordnete
 * Seite den Status neu lädt (der erste Wareneingang hebt ihn auto. auf „Erhalten").
 */
export default function GoodsReceiptSection({
  productionOrderId,
  onChanged,
}: {
  productionOrderId: string
  onChanged: () => void
}) {
  const t = useT()

  const [rows, setRows] = useState<ReconciliationRow[]>([])
  const [receipts, setReceipts] = useState<GoodsReceiptWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [qty, setQty] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [rec, rcpts] = await Promise.all([
        getReconciliation(productionOrderId),
        listGoodsReceipts(productionOrderId),
      ])
      setRows(rec)
      setReceipts(rcpts)
    } catch {
      setError(t('goodsReceipt.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionOrderId])

  const totals = useMemo(() => {
    let ordered = 0
    let received = 0
    let distributed = 0
    for (const r of rows) {
      ordered += r.ordered
      received += r.received
      distributed += r.distributed
    }
    return { ordered, received, distributed }
  }, [rows])

  function openForm() {
    setQty({})
    setDate(new Date().toISOString().slice(0, 10))
    setError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const items = rows
        .map((r) => ({
          production_order_item_id: r.production_order_item_id,
          quantity: Number(qty[r.production_order_item_id]) || 0,
        }))
        .filter((i) => i.quantity > 0)
      if (items.length === 0) {
        setError(t('goodsReceipt.nothingEntered'))
        setBusy(false)
        return
      }
      await createGoodsReceipt(productionOrderId, date, items)
      setFormOpen(false)
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('goodsReceipt.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('goodsReceipt.deleteConfirm'))) return
    try {
      await deleteGoodsReceipt(id)
      await load()
      onChanged()
    } catch {
      setError(t('goodsReceipt.deleteError'))
    }
  }

  const cellInput =
    'w-full rounded-md border-[0.5px] border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-ink'
  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <section className="mb-8 print:hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">{t('goodsReceipt.heading')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('goodsReceipt.desc')}</p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openForm}
            disabled={rows.length === 0}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t('goodsReceipt.record')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Erfassungs-Formular ─────────────────────────────────────────── */}
      {formOpen && (
        <div className="mb-6 rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
          <label className="mb-4 flex max-w-xs flex-col gap-1.5">
            <span className="text-sm text-muted">{t('goodsReceipt.date')}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('common.product')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.color')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.size')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.ordered')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.alreadyReceived')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.receiveNow')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.production_order_item_id}
                    className="border-t-[0.5px] border-line bg-surface text-ink"
                  >
                    <td className="px-4 py-2.5 font-medium">{r.productName}</td>
                    <td className="px-4 py-2.5">{r.color ?? '—'}</td>
                    <td className="px-4 py-2.5">{r.size ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.ordered.toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted">
                      {r.received.toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-2 w-28">
                      <input
                        type="number"
                        min={0}
                        value={qty[r.production_order_item_id] ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setQty((prev) => ({
                            ...prev,
                            [r.production_order_item_id]: e.target.value,
                          }))
                        }
                        className={`${cellInput} text-right`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* ─── Liste erfasster Wareneingänge ───────────────────────────────── */}
      {receipts.length > 0 && (
        <ul className="mb-6 divide-y divide-line rounded-md border-[0.5px] border-line">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="text-ink">
                {t('goodsReceipt.receiptLabel', { date: formatDate(r.received_date) })}
                <span className="ml-2 text-muted">
                  {t('goodsReceipt.receiptPieces', {
                    pieces: receiptTotal(r).toLocaleString('de-DE'),
                  })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="text-muted transition-colors hover:text-red-700"
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ─── Abgleich Wareneingang ↔ Verteilung ──────────────────────────── */}
      <h3 className="mb-1 text-base font-medium text-ink">
        {t('goodsReceipt.reconcileHeading')}
      </h3>
      <p className="mb-3 text-sm text-muted">{t('goodsReceipt.reconcileHint')}</p>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{t('common.noPositions')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('goodsReceipt.col.position')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.ordered')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.received')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.distributed')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('goodsReceipt.col.rest')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rest = r.received - r.distributed
                const overrun = rest < 0
                return (
                  <tr
                    key={r.production_order_item_id}
                    className="border-t-[0.5px] border-line bg-surface text-ink"
                  >
                    <td className="px-4 py-2.5 font-medium">{rowLabel(r)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted">
                      {r.ordered.toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.received.toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {r.distributed.toLocaleString('de-DE')}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right whitespace-nowrap ${
                        overrun ? 'font-medium text-red-700' : 'text-muted'
                      }`}
                    >
                      {rest > 0 ? '+' : ''}
                      {rest.toLocaleString('de-DE')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-[0.5px] border-line bg-card text-ink">
                <td className="px-4 py-3 font-medium">{t('common.total')}</td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-muted">
                  {totals.ordered.toLocaleString('de-DE')}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {totals.received.toLocaleString('de-DE')}
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {totals.distributed.toLocaleString('de-DE')}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                    totals.received - totals.distributed < 0 ? 'text-red-700' : 'text-muted'
                  }`}
                >
                  {totals.received - totals.distributed > 0 ? '+' : ''}
                  {(totals.received - totals.distributed).toLocaleString('de-DE')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
