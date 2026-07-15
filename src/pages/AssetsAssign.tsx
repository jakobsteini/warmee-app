import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listAssets,
  setAssetProduct,
  setAssetNoProductMatch,
} from '../lib/assets'
import { listProducts } from '../lib/products'
import {
  suggestProducts,
  filterProducts,
  productLabel,
} from '../lib/productMatch'
import type { AssetWithMeta } from '../types/asset'
import type { Product } from '../types/product'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'

export default function AssetsAssign() {
  const t = useT()
  const [assets, setAssets] = useState<AssetWithMeta[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, p] = await Promise.all([listAssets({}), listProducts()])
      setAssets(a)
      setProducts(p)
    } catch {
      setError(t('assign.loadError'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const total = assets.length
  const assignedCount = useMemo(
    () => assets.filter((a) => a.product_id !== null).length,
    [assets],
  )
  const noMatchCount = useMemo(
    () => assets.filter((a) => a.no_product_match === true).length,
    [assets],
  )
  const unassigned = useMemo(
    () =>
      assets.filter(
        (a) => a.product_id === null && a.no_product_match !== true,
      ),
    [assets],
  )

  async function assign(assetId: string, productId: string) {
    setError(null)
    try {
      await setAssetProduct(assetId, productId)
      // Lokal spiegeln → Bild verlässt die Liste, Zähler steigt.
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, product_id: productId } : a,
        ),
      )
    } catch {
      setError(t('assign.assignError'))
    }
  }

  async function skip(assetId: string) {
    setError(null)
    try {
      await setAssetNoProductMatch(assetId, true)
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, no_product_match: true } : a,
        ),
      )
    } catch {
      setError(t('assign.skipError'))
    }
  }

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('assign.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('assign.subtitle')}</p>
      </div>

      {/* Fortschritt */}
      <div className="mb-6 rounded-md border-[0.5px] border-line bg-card px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink">
            <span className="font-medium">{assignedCount}</span>
            {t('assign.progressMid')}
            <span className="font-medium">{total}</span>
            {t('assign.progressEnd')}
          </span>
          <span className="text-muted">
            {t('assign.openCount', { count: unassigned.length })}
            {noMatchCount > 0 && t('assign.noMatchCount', { count: noMatchCount })}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-ink transition-all"
            style={{
              width: total > 0 ? `${(assignedCount / total) * 100}%` : '0%',
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : unassigned.length === 0 ? (
        <EmptyState>
          {total === 0 ? t('assign.emptyNoImages') : t('assign.emptyAllDone')}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {unassigned.map((asset) => (
            <AssignCard
              key={asset.id}
              asset={asset}
              products={products}
              onAssign={(productId) => assign(asset.id, productId)}
              onSkip={() => skip(asset.id)}
              productById={productById}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AssignCard({
  asset,
  products,
  onAssign,
  onSkip,
  productById,
}: {
  asset: AssetWithMeta
  products: Product[]
  onAssign: (productId: string) => Promise<void>
  onSkip: () => void
  productById: Map<string, Product>
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const suggestions = useMemo(
    () => suggestProducts(asset.model, products).slice(0, 6),
    [asset.model, products],
  )
  const searchResults = useMemo(
    () => (query.trim() === '' ? [] : filterProducts(query, products).slice(0, 8)),
    [query, products],
  )
  const selected = selectedId ? (productById.get(selectedId) ?? null) : null

  const colorText = [
    [asset.color_code, asset.color_name].filter(Boolean).join(' '),
    [asset.color_code_2, asset.color_name_2].filter(Boolean).join(' '),
  ]
    .filter((s) => s.length > 0)
    .join(', ')

  async function confirm() {
    if (!selectedId) return
    setSaving(true)
    await onAssign(selectedId)
    // Kein Reset nötig – die Karte verschwindet nach erfolgreicher Zuordnung.
    setSaving(false)
  }

  const chipBase =
    'rounded-full px-3 py-1.5 text-sm transition-colors border-[0.5px]'

  return (
    <div className="flex flex-col gap-4 rounded-lg border-[0.5px] border-line bg-surface p-4 sm:flex-row">
      {/* Vorschau */}
      <div className="h-40 w-40 shrink-0 overflow-hidden rounded-md border-[0.5px] border-line bg-card">
        {asset.url ? (
          <img
            src={asset.url}
            alt={asset.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted">
            {asset.filename}
          </div>
        )}
      </div>

      {/* Zuordnung */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={asset.filename}>
          {asset.filename}
        </p>
        <p className="mt-1 text-xs text-muted">
          {asset.model ? (
            <>
              {t('common.model')} <span className="text-ink">{asset.model}</span>
            </>
          ) : (
            <span className="italic">{t('assign.noModel')}</span>
          )}
          {colorText && (
            <>
              {' · '}
              {t('common.color')} <span className="text-ink">{colorText}</span>
            </>
          )}
        </p>

        {/* Vorschläge */}
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted">
            {asset.model ? t('assign.suggestions') : t('assign.noModelSearch')}
          </p>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => {
                const active = selectedId === s.product.id
                return (
                  <button
                    key={s.product.id}
                    type="button"
                    onClick={() => setSelectedId(s.product.id)}
                    className={[
                      chipBase,
                      active
                        ? 'border-ink bg-ink text-cream'
                        : 'border-line text-ink hover:bg-card',
                    ].join(' ')}
                  >
                    {productLabel(s.product)}
                    {s.kind === 'exact' && (
                      <span
                        className={active ? 'text-cream/70' : 'text-muted'}
                      >
                        {' · '}
                        {t('assign.exact')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            asset.model && (
              <p className="text-sm text-muted">{t('assign.noSimilar')}</p>
            )
          )}
        </div>

        {/* Durchsuchbare Gesamtauswahl */}
        <div className="mt-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('assign.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          {searchResults.length > 0 && (
            <div className="mt-1 max-h-48 w-full max-w-sm overflow-y-auto rounded-md border-[0.5px] border-line bg-cream">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id)
                    setQuery('')
                  }}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-card"
                >
                  {productLabel(p)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Aktionen */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {selected ? (
            <span className="text-sm text-ink">
              {t('assign.chosen')} <span className="font-medium">{productLabel(selected)}</span>
            </span>
          ) : (
            <span className="text-sm text-muted">{t('assign.noneChosen')}</span>
          )}
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-muted transition-colors hover:bg-card hover:text-ink"
              title={t('assign.noMatchTitle')}
            >
              {t('assign.noMatchBtn')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!selectedId || saving}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('assign.assign')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
