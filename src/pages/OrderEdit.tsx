import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addOrderItem,
  deleteOrderItem,
  getOrder,
  listOrderItems,
  updateOrderItem,
  updateOrderNotes,
  updateOrderStatus,
} from '../lib/orders'
import { listProducts } from '../lib/products'
import { listDealers } from '../lib/dealers'
import { listSeasons } from '../lib/seasons'
import { formatEUR, parsePrice } from '../lib/money'
import {
  lineTotal,
  nextStatus,
  statusLabel,
  type Order,
  type OrderItemWithProduct,
} from '../types/order'
import type { Product } from '../types/product'
import type { Dealer } from '../types/dealer'
import type { Season } from '../types/asset'

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

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItemWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [add, setAdd] = useState<AddForm>(emptyAdd)
  const [adding, setAdding] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [ord, its, prods, deals, seas] = await Promise.all([
        getOrder(id),
        listOrderItems(id),
        listProducts(),
        listDealers(),
        listSeasons(),
      ])
      setOrder(ord)
      setItems(its)
      setProducts(prods)
      setNotes(ord.notes ?? '')
      setDealer(deals.find((d) => d.id === ord.dealer_id) ?? null)
      setSeason(seas.find((s) => s.id === ord.season_id) ?? null)
    } catch {
      setError('Order konnte nicht geladen werden.')
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

  const total = useMemo(
    () => items.reduce((sum, i) => sum + lineTotal(i.quantity, i.unit_price), 0),
    [items],
  )

  async function handleAdvanceStatus() {
    if (!order) return
    const next = nextStatus(order.status)
    if (!next) return
    try {
      const updated = await updateOrderStatus(order.id, next)
      setOrder(updated)
    } catch {
      setError('Status konnte nicht geändert werden.')
    }
  }

  async function handleNotesBlur() {
    if (!order || notes === (order.notes ?? '')) return
    try {
      await updateOrderNotes(order.id, notes.trim() || null)
      setOrder({ ...order, notes: notes.trim() || null })
    } catch {
      setError('Notiz konnte nicht gespeichert werden.')
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
      setError('Artikel konnte nicht hinzugefügt werden.')
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
      setError('Änderung konnte nicht gespeichert werden.')
    }
  }

  async function handleRemove(itemId: string) {
    try {
      await deleteOrderItem(itemId)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch {
      setError('Zeile konnte nicht gelöscht werden.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const cellInput =
    'w-full rounded-md border-[0.5px] border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-ink'

  if (loading) return <p className="text-sm text-muted">Lädt…</p>
  if (!order)
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/orders" className="text-sm text-muted hover:text-ink">
          ← Zurück zu Orders
        </Link>
        <p className="mt-6 text-sm text-red-700">
          {error ?? 'Order nicht gefunden.'}
        </p>
      </div>
    )

  const next = nextStatus(order.status)
  const addProduct = add.product_id ? productMap.get(add.product_id) : undefined

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/orders" className="text-sm text-muted hover:text-ink">
        ← Zurück zu Orders
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {dealer?.name ?? 'Order'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Saison {season?.label ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            Status:{' '}
            <span className="font-medium text-ink">
              {statusLabel(order.status)}
            </span>
          </span>
          {next && (
            <button
              type="button"
              onClick={handleAdvanceStatus}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
            >
              {statusLabel(next)} setzen
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="mb-8 flex flex-col gap-1.5">
        <span className="text-sm text-muted">Notiz</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Interne Notiz zur Order"
          className={inputClass}
        />
      </label>

      <h2 className="mb-3 text-lg font-medium text-ink">Artikel</h2>

      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-3 py-3 font-medium">Artikel</th>
              <th className="px-3 py-3 font-medium">Farbe</th>
              <th className="px-3 py-3 font-medium">Größe</th>
              <th className="px-3 py-3 font-medium">Menge</th>
              <th className="px-3 py-3 font-medium">Einzelpreis</th>
              <th className="px-3 py-3 text-right font-medium">Summe</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-white">
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Noch keine Artikel. Unten hinzufügen.
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const colorOptions = i.product?.color ?? []
                return (
                  <tr
                    key={i.id}
                    className="border-t-[0.5px] border-line bg-white text-ink"
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
                        Entfernen
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-line bg-card text-ink">
              <td colSpan={5} className="px-3 py-3 font-medium">
                Gesamtsumme
              </td>
              <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                {formatEUR(total)}
              </td>
              <td className="px-3 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Artikel hinzufügen */}
      <form
        onSubmit={handleAdd}
        className="mt-6 rounded-md border-[0.5px] border-line bg-card p-4"
      >
        <h3 className="mb-3 text-sm font-medium text-ink">Artikel hinzufügen</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <span className="text-xs text-muted">Produkt *</span>
            <select
              required
              value={add.product_id}
              onChange={(e) => onSelectProduct(e.target.value)}
              className={inputClass}
            >
              <option value="">— aus Katalog wählen —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-32 flex-col gap-1.5">
            <span className="text-xs text-muted">Farbe</span>
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
            <span className="text-xs text-muted">Größe</span>
            <input
              type="text"
              value={add.size}
              onChange={(e) => setAdd({ ...add, size: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex w-20 flex-col gap-1.5">
            <span className="text-xs text-muted">Menge</span>
            <input
              type="number"
              min={0}
              value={add.quantity}
              onChange={(e) => setAdd({ ...add, quantity: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex w-28 flex-col gap-1.5">
            <span className="text-xs text-muted">Einzelpreis (€)</span>
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
            {adding ? 'Fügt hinzu…' : 'Hinzufügen'}
          </button>
        </div>
      </form>
    </div>
  )
}
