import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getProductionOrder,
  listProductionOrderItems,
  updateProductionNotes,
  updateProductionStatus,
} from '../lib/productionOrders'
import { listSeasons } from '../lib/seasons'
import GoodsReceiptSection from '../components/GoodsReceiptSection'
import {
  nextProductionStatus,
  type ProductionOrder,
  type ProductionOrderItemWithProduct,
} from '../types/productionOrder'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')

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
      setSeason(seas.find((s) => s.id === ord.season_id) ?? null)
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

  async function handleNotesBlur() {
    if (!order || notes === (order.notes ?? '')) return
    try {
      await updateProductionNotes(order.id, notes.trim() || null)
      setOrder({ ...order, notes: notes.trim() || null })
    } catch {
      setError(t('common.notesSaveError'))
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
            {t('productionOrders.title')}
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

      <label className="mb-8 flex flex-col gap-1.5 print:hidden">
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
              <th className="px-4 py-3 text-right font-medium">{t('productionOrders.col.totalPieces')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
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
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
