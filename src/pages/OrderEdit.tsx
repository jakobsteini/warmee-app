import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addOrderItem,
  deleteOrderItem,
  getOrder,
  listOrderItems,
  updateOrderAssignment,
  updateOrderHead,
  updateOrderItem,
  updateOrderNotes,
  updateOrderStatus,
} from '../lib/orders'
import OrderHeadFieldsForm from '../components/OrderHeadFields'
import { listProducts } from '../lib/products'
import { listDealers } from '../lib/dealers'
import { listSeasons } from '../lib/seasons'
import { listDealerCredits, type DealerCredit } from '../lib/creditRating'
import { formatEUR, parsePrice } from '../lib/money'
import { totalAmount, totalQuantity } from '../lib/orderCalc'
import { taxCalc, applyVat as applyVatAt } from '../lib/taxCalc'
import { listOssRates, ossRateMap } from '../lib/ossRates'
import CreditHint from '../components/CreditHint'
import {
  lineTotal,
  nextStatus,
  ORDER_ASSIGNMENTS,
  emptyOrderHead,
  orderHeadToForm,
  orderHeadFromForm,
  orderHeadDateRangeOk,
  type Order,
  type OrderAssignment,
  type OrderItemWithProduct,
  type OrderHeadForm,
} from '../types/order'
import type { Product } from '../types/product'
import type { Dealer } from '../types/dealer'
import type { Season } from '../types/asset'
import { validateOrderPaymentTerms } from '../lib/paymentTerms'
import { validateShipping } from '../lib/shipping'
import { useT, useI18n } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Order-Status → Übersetzungs-Key. */
function orderStatusKey(status: string): TranslationKey {
  return `order.status.${status}` as TranslationKey
}

/** Zuteilung → Übersetzungs-Key. */
function assignmentKey(assignment: string): TranslationKey {
  return `order.assignment.${assignment}` as TranslationKey
}

interface AddForm {
  product_id: string
  color: string
  size: string
  quantity: string
  unit_price: string
}

const emptyAdd: AddForm = {
  product_id: '',
  color: '',
  size: '',
  quantity: '1',
  unit_price: '',
}

export default function OrderEdit() {
  const { id } = useParams<{ id: string }>()
  const t = useT()
  const { lang } = useI18n()

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItemWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [credit, setCredit] = useState<DealerCredit | undefined>(undefined)
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [head, setHead] = useState<OrderHeadForm>(emptyOrderHead)
  const [headSaving, setHeadSaving] = useState(false)
  const [headError, setHeadError] = useState<string | null>(null)
  const [add, setAdd] = useState<AddForm>(emptyAdd)
  const [adding, setAdding] = useState(false)
  const [abBusy, setAbBusy] = useState(false)
  // OSS-Sätze für die MwSt-VORSCHAU (reine Anzeige). Ohne sie fällt taxCalc bei
  // B2C-EU auf ossMissing → neutraler Hinweis (kein Block, Order ≠ Steuerbeleg).
  const [ossMap, setOssMap] = useState<Record<string, number>>({})

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [ord, its, prods, deals, seas, creds, oss] = await Promise.all([
        getOrder(id),
        listOrderItems(id),
        listProducts(),
        listDealers(),
        listSeasons(),
        // Bonität aus der bestehenden Ampel-Lib; ohne Bewertung bleibt der
        // Hinweis neutral.
        listDealerCredits().catch(() => new Map<string, DealerCredit>()),
        listOssRates().catch(() => []),
      ])
      setOrder(ord)
      setItems(its)
      setProducts(prods)
      setNotes(ord.notes ?? '')
      setHead(orderHeadToForm(ord))
      setOssMap(ossRateMap(oss))
      setDealer(deals.find((d) => d.id === ord.dealer_id) ?? null)
      setCredit(creds.get(ord.dealer_id))
      setSeason(seas.find((s) => s.id === ord.season_id) ?? null)
    } catch {
      setError(t('orderEdit.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  const total = useMemo(() => totalAmount(items), [items])
  const pieces = useMemo(() => totalQuantity(items), [items])

  /**
   * MwSt-VORSCHAU — reine Anzeige, NICHTS wird gespeichert/eingefroren. Der
   * verbindliche Steuer-Snapshot passiert ausschließlich bei der Rechnung
   * (Steuer-Modul Teil 4). Unsichere Lage (kein Land / ossMissing / review)
   * blockt hier NICHT — sie zeigt nur einen neutralen Hinweis.
   */
  const taxPreview = useMemo(() => {
    if (!dealer) return null
    if (!dealer.country_iso2) return { uncertain: true as const }
    const tax = taxCalc(
      {
        customer_group: dealer.customer_group,
        country_iso2: dealer.country_iso2,
        uid: dealer.uid,
      },
      ossMap,
    )
    if (tax.ossMissing || tax.review) return { uncertain: true as const }
    const { vat, gross } = applyVatAt(total, tax.rate)
    const note = tax.note ? (lang === 'en' ? tax.note.en : tax.note.de) : null
    return { uncertain: false as const, rate: tax.rate, vat, gross, note }
  }, [dealer, ossMap, total, lang])

  async function handleAdvanceStatus() {
    if (!order) return
    const next = nextStatus(order.status)
    if (!next) return
    try {
      const updated = await updateOrderStatus(order.id, next)
      setOrder(updated)
    } catch {
      setError(t('common.statusChangeError'))
    }
  }

  async function handleNotesBlur() {
    if (!order || notes === (order.notes ?? '')) return
    try {
      await updateOrderNotes(order.id, notes.trim() || null)
      setOrder({ ...order, notes: notes.trim() || null })
    } catch {
      setError(t('common.notesSaveError'))
    }
  }

  /** Auftragsbestätigung als PDF (Wegwerf-Blob) — nur bei bestätigter Order. */
  async function handleAbPdf() {
    if (!order?.order_number) return
    setAbBusy(true)
    setError(null)
    try {
      const { buildOrderConfirmationData } = await import('../lib/orderConfirmation')
      const data = await buildOrderConfirmationData(order.id)
      const { buildOrderConfirmationPdf } = await import('../lib/pdf')
      const blob = buildOrderConfirmationPdf(data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${order.order_number}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(t('orderEdit.abError'))
    } finally {
      setAbBusy(false)
    }
  }

  async function handleHeadSave() {
    if (!order) return
    if (!orderHeadDateRangeOk(head)) {
      setHeadError(t('order.field.dateRangeInvalid'))
      return
    }
    const pt = validateOrderPaymentTerms(head)
    if (!pt.ok) {
      setHeadError(t(pt.error as TranslationKey))
      return
    }
    const ship = validateShipping({
      method: head.shipping_method,
      freitext: head.shipping_method_freitext,
    })
    if (!ship.ok) {
      setHeadError(t(ship.error as TranslationKey))
      return
    }
    setHeadSaving(true)
    setHeadError(null)
    try {
      const updated = await updateOrderHead(order.id, orderHeadFromForm(head))
      setOrder(updated)
    } catch {
      setHeadError(t('common.saveFailed'))
    } finally {
      setHeadSaving(false)
    }
  }

  async function handleAssignment(assignment: OrderAssignment) {
    if (!order || assignment === order.assignment) return
    try {
      const updated = await updateOrderAssignment(order.id, assignment)
      setOrder(updated)
    } catch {
      setError(t('common.saveFailed'))
    }
  }

  /** Beim Produktwechsel den Einzelpreis mit dem Großhandelspreis vorbelegen. */
  function onSelectProduct(product_id: string) {
    const p = productMap.get(product_id)
    setAdd((a) => ({
      ...a,
      product_id,
      unit_price:
        p?.wholesale_price != null && a.unit_price === ''
          ? String(p.wholesale_price)
          : a.unit_price,
    }))
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!order || !add.product_id) return
    setAdding(true)
    setError(null)
    try {
      await addOrderItem(order.id, {
        product_id: add.product_id,
        color: add.color.trim() || null,
        size: add.size.trim() || null,
        quantity: Number(add.quantity) || 0,
        unit_price: parsePrice(add.unit_price),
      })
      setAdd(emptyAdd)
      setItems(await listOrderItems(order.id))
    } catch {
      setError(t('orderEdit.addError'))
    } finally {
      setAdding(false)
    }
  }

  /** Lokale Änderung einer Zeile (ohne Persistenz). */
  function patchLocal(itemId: string, patch: Partial<OrderItemWithProduct>) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    )
  }

  /** Feld einer Zeile speichern (onBlur). */
  async function saveField(
    itemId: string,
    field: 'color' | 'size' | 'quantity' | 'unit_price',
    value: string,
  ) {
    try {
      if (field === 'quantity') {
        await updateOrderItem(itemId, { quantity: Number(value) || 0 })
      } else if (field === 'unit_price') {
        await updateOrderItem(itemId, { unit_price: parsePrice(value) })
      } else {
        await updateOrderItem(itemId, { [field]: value.trim() || null })
      }
    } catch {
      setError(t('orderEdit.editError'))
    }
  }

  async function handleRemove(itemId: string) {
    try {
      await deleteOrderItem(itemId)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch {
      setError(t('orderEdit.removeError'))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const cellInput =
    'w-full rounded-md border-[0.5px] border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-ink'

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (!order)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/orders" className="text-sm text-muted hover:text-ink">
          {t('orderEdit.back')}
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? t('orderEdit.notFound')}
        </p>
      </div>
    )

  const next = nextStatus(order.status)
  const addProduct = add.product_id ? productMap.get(add.product_id) : undefined

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/orders" className="text-sm text-muted hover:text-ink">
        {t('orderEdit.back')}
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {dealer?.name ?? t('orderEdit.fallbackTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('common.seasonValue', { season: season?.label ?? '—' })}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {t('order.number')}:{' '}
            <span className="text-ink">
              {order.order_number ?? t('order.draftNumberHint')}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('order.assignmentLabel')}
            <select
              value={order.assignment}
              onChange={(e) => handleAssignment(e.target.value as OrderAssignment)}
              className="rounded-md border-[0.5px] border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink"
            >
              {ORDER_ASSIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {t(assignmentKey(a))}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm text-muted">
            {t('common.status')}:{' '}
            <span className="font-medium text-ink">
              {t(orderStatusKey(order.status))}
            </span>
          </span>
          {next && (
            <button
              type="button"
              onClick={handleAdvanceStatus}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
            >
              {t('common.setStatus', { status: t(orderStatusKey(next)) })}
            </button>
          )}
          <button
            type="button"
            onClick={handleAbPdf}
            disabled={!order.order_number || abBusy}
            title={!order.order_number ? t('orderEdit.abNeedsConfirm') : undefined}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
          >
            {abBusy ? t('common.loading') : t('orderEdit.abPdf')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-8">
        <CreditHint credit={credit} creditLimit={dealer?.credit_limit} />
      </div>

      <div className="mb-8 rounded-lg border-[0.5px] border-line p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink">{t('order.headTitle')}</h2>
          <button
            type="button"
            onClick={handleHeadSave}
            disabled={headSaving}
            className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
        <OrderHeadFieldsForm
          value={head}
          onChange={(patch) => setHead((h) => ({ ...h, ...patch }))}
        />
        {headError && <p className="mt-2 text-sm text-red-700">{headError}</p>}
      </div>

      <label className="mb-8 flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t('common.notes')}</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder={t('orderEdit.notesPlaceholder')}
          className={inputClass}
        />
      </label>

      <h2 className="mb-3 text-lg font-medium text-ink">{t('orderEdit.articles')}</h2>

      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-3 font-medium">{t('common.article')}</th>
              <th className="px-3 py-3 font-medium">{t('common.color')}</th>
              <th className="px-3 py-3 font-medium">{t('common.size')}</th>
              <th className="px-3 py-3 font-medium">{t('common.quantity')}</th>
              <th className="px-3 py-3 font-medium">{t('common.unitPrice')}</th>
              <th className="px-3 py-3 text-right font-medium">{t('common.lineSum')}</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  {t('orderEdit.emptyRow')}
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const colorOptions = i.product?.color ?? []
                return (
                  <tr
                    key={i.id}
                    className="border-t-[0.5px] border-line bg-surface text-ink"
                  >
                    <td className="px-3 py-2 font-medium">
                      {i.product?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        list={`colors-${i.id}`}
                        value={i.color ?? ''}
                        onChange={(e) =>
                          patchLocal(i.id, { color: e.target.value })
                        }
                        onBlur={(e) => saveField(i.id, 'color', e.target.value)}
                        className={cellInput}
                      />
                      {colorOptions.length > 0 && (
                        <datalist id={`colors-${i.id}`}>
                          {colorOptions.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={i.size ?? ''}
                        onChange={(e) =>
                          patchLocal(i.id, { size: e.target.value })
                        }
                        onBlur={(e) => saveField(i.id, 'size', e.target.value)}
                        className={cellInput}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        type="number"
                        min={0}
                        value={i.quantity}
                        onChange={(e) =>
                          patchLocal(i.id, {
                            quantity: Number(e.target.value) || 0,
                          })
                        }
                        onBlur={(e) =>
                          saveField(i.id, 'quantity', e.target.value)
                        }
                        className={cellInput}
                      />
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={i.unit_price ?? ''}
                        onChange={(e) =>
                          patchLocal(i.id, { unit_price: e.target.value })
                        }
                        onBlur={(e) =>
                          saveField(i.id, 'unit_price', e.target.value)
                        }
                        placeholder="0,00"
                        className={cellInput}
                      />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatEUR(lineTotal(i.quantity, i.unit_price))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(i.id)}
                        className="text-muted transition-colors hover:text-red-700"
                      >
                        {t('common.remove')}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line text-muted">
              <td colSpan={5} className="px-3 py-2">
                {t('orderEdit.totalPieces')}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {pieces}
              </td>
              <td className="px-3 py-2" />
            </tr>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={5} className="px-3 py-3 font-medium">
                {t('orderEdit.grandTotal')}
              </td>
              <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                {formatEUR(total)}
              </td>
              <td className="px-3 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* MwSt-VORSCHAU — reine Anzeige, kein Einfrieren (Snapshot bei Rechnung). */}
      {taxPreview && (
        <div className="mt-4 max-w-sm rounded-lg border-[0.5px] border-line bg-card p-4 text-sm">
          <div className="mb-2 text-xs font-medium text-muted">
            {t('orderEdit.taxPreview')}
          </div>
          {taxPreview.uncertain ? (
            <p className="text-xs text-muted">{t('orderEdit.taxPreviewUncertain')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-muted">{t('orderEdit.taxNet')}</span>
                <span className="text-ink">{formatEUR(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {t('orderEdit.taxVat', {
                    rate: String(Math.round(taxPreview.rate * 100)),
                  })}
                </span>
                <span className="text-ink">{formatEUR(taxPreview.vat)}</span>
              </div>
              <div className="flex justify-between border-t-[0.5px] border-line pt-1 font-medium">
                <span className="text-ink">{t('orderEdit.taxGross')}</span>
                <span className="text-ink">{formatEUR(taxPreview.gross)}</span>
              </div>
              {taxPreview.note && (
                <p className="mt-1 text-xs text-muted">{taxPreview.note}</p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                {t('orderEdit.taxPreviewHint')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Artikel hinzufügen */}
      <form
        onSubmit={handleAdd}
        className="mt-6 rounded-md border-[0.5px] border-line bg-card p-4"
      >
        <h3 className="mb-3 text-sm font-medium text-ink">{t('orderEdit.addArticle')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted">{t('orderEdit.productReq')}</span>
            <select
              required
              value={add.product_id}
              onChange={(e) => onSelectProduct(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('orderEdit.productPlaceholder')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-32 flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.color')}</span>
            <input
              type="text"
              list="add-colors"
              value={add.color}
              onChange={(e) => setAdd({ ...add, color: e.target.value })}
              className={inputClass}
            />
            {addProduct?.color && addProduct.color.length > 0 && (
              <datalist id="add-colors">
                {addProduct.color.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </label>
          <label className="flex w-24 flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.size')}</span>
            <input
              type="text"
              value={add.size}
              onChange={(e) => setAdd({ ...add, size: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex w-20 flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.quantity')}</span>
            <input
              type="number"
              min={0}
              value={add.quantity}
              onChange={(e) => setAdd({ ...add, quantity: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex w-28 flex-col gap-1.5">
            <span className="text-xs text-muted">{t('orderEdit.unitPriceEur')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={add.unit_price}
              onChange={(e) => setAdd({ ...add, unit_price: e.target.value })}
              placeholder="0,00"
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={adding || !add.product_id}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {adding ? t('orderEdit.adding') : t('orderEdit.add')}
          </button>
        </div>
      </form>
    </div>
  )
}
