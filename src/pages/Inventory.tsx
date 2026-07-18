import { useEffect, useMemo, useState } from 'react'
import { readInventoryStock } from '../lib/inventory'
import { listProducts } from '../lib/products'
import { listAllVariants } from '../lib/productVariants'
import type { InventoryStockRow, Warehouse } from '../types/inventory'
import type { Product } from '../types/product'
import type { ProductVariant } from '../types/productVariant'
import InventoryMovementModal from '../components/InventoryMovementModal'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

type WarehouseFilter = 'all' | Warehouse

function warehouseLabelKey(w: Warehouse): TranslationKey {
  return `inventory.warehouse.${w}` as TranslationKey
}

const pillBase = 'rounded-full px-3 py-1 text-sm transition-colors'
const pillActive = 'bg-ink text-cream'
const pillInactive = 'border-[0.5px] border-line text-ink hover:bg-card'

export default function Inventory() {
  const t = useT()
  const [stock, setStock] = useState<InventoryStockRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<WarehouseFilter>('all')
  const [showEmpty, setShowEmpty] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [rows, prods, vars] = await Promise.all([
        readInventoryStock(),
        listProducts(),
        listAllVariants(),
      ])
      setStock(rows)
      setProducts(prods)
      setVariants(vars)
    } catch {
      setError(t('inventory.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const productName = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  )
  const variantName = useMemo(
    () => new Map(variants.map((v) => [v.id, v.name])),
    [variants],
  )

  const rows = useMemo(() => {
    return stock
      .filter((r) => (filter === 'all' ? true : r.warehouse === filter))
      .filter((r) => (showEmpty ? true : r.bestand !== 0))
      .map((r) => ({
        ...r,
        name: productName.get(r.product_id) ?? '—',
        variant: r.variant_id ? variantName.get(r.variant_id) ?? '—' : null,
      }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'de') ||
          (a.color ?? '').localeCompare(b.color ?? '', 'de') ||
          (a.size ?? '').localeCompare(b.size ?? '', 'de') ||
          (a.variant ?? '').localeCompare(b.variant ?? '', 'de') ||
          a.warehouse.localeCompare(b.warehouse),
      )
  }, [stock, filter, showEmpty, productName, variantName])

  const filters: { key: WarehouseFilter; labelKey: TranslationKey }[] = [
    { key: 'all', labelKey: 'inventory.filter.all' },
    { key: 'bestand', labelKey: 'inventory.warehouse.bestand' },
    { key: 'online', labelKey: 'inventory.warehouse.online' },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('inventory.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('inventory.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={products.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('inventory.addMovement')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`${pillBase} ${filter === f.key ? pillActive : pillInactive}`}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
            className="accent-ink"
          />
          {t('inventory.showEmpty')}
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          actionLabel={t('inventory.addMovement')}
          onAction={() => setModalOpen(true)}
          actionDisabled={products.length === 0}
        >
          {stock.length === 0 ? t('inventory.empty') : t('inventory.emptyFiltered')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('common.article')}</th>
                <th className="px-4 py-3 font-medium">{t('inventory.col.variant')}</th>
                <th className="px-4 py-3 font-medium">{t('common.color')}</th>
                <th className="px-4 py-3 font-medium">{t('common.size')}</th>
                <th className="px-4 py-3 font-medium">{t('inventory.col.warehouse')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('inventory.col.stock')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t-[0.5px] border-line bg-surface text-ink">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted">{r.variant ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{r.color ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{r.size ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{t(warehouseLabelKey(r.warehouse))}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      r.bestand < 0 ? 'font-medium text-red-700' : 'text-ink'
                    }`}
                    title={r.bestand < 0 ? t('inventory.negativeHint') : undefined}
                  >
                    {r.bestand.toLocaleString('de-DE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <InventoryMovementModal
          products={products}
          variants={variants}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}
