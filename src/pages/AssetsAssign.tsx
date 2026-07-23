import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listAssets,
  setAssetProduct,
  setAssetProductAndVariant,
  setAssetNoProductMatch,
} from '../lib/assets'
import { listProducts } from '../lib/products'
import { listAllVariants } from '../lib/productVariants'
import {
  suggestProducts,
  filterProducts,
  productLabel,
  exactProductMatch,
} from '../lib/productMatch'
import { isOpenAsset } from '../lib/assetFilter'
import type { AssetWithMeta } from '../types/asset'
import type { Product } from '../types/product'
import type { ProductVariant } from '../types/productVariant'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'

export default function AssetsAssign() {
  const t = useT()
  const [assets, setAssets] = useState<AssetWithMeta[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Farbmuster (swatch) sind für die Zuordnung Rauschen → standardmäßig aus.
  const [hideSwatches, setHideSwatches] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, p, v] = await Promise.all([
        listAssets({}),
        listProducts(),
        listAllVariants(),
      ])
      setAssets(a)
      setProducts(p)
      setVariants(v)
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
        (a) => isOpenAsset(a) && (!hideSwatches || a.asset_type !== 'swatch'),
      ),
    [assets, hideSwatches],
  )

  // Eindeutige exakte Namenstreffer über die aktuell offene Liste. Nur genau
  // ein passender Artikel (kein_treffer/mehrdeutig fallen raus, kein Präfix).
  const exactMatches = useMemo(
    () =>
      unassigned
        .map((asset) => ({
          asset,
          product: exactProductMatch(asset.model, products),
        }))
        .filter(
          (m): m is { asset: AssetWithMeta; product: Product } =>
            m.product !== null,
        ),
    [unassigned, products],
  )

  async function assign(
    assetId: string,
    productId: string,
    variantId: string | null,
  ) {
    setError(null)
    try {
      await setAssetProductAndVariant(assetId, productId, variantId)
      // Lokal spiegeln → Bild verlässt die Liste, Zähler steigt.
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? { ...a, product_id: productId, variant_id: variantId }
            : a,
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

  // Alle eindeutigen exakten Treffer nach Bestätigung schreiben. Pro Paar ein
  // Write; danach lokal spiegeln, damit die Karten verschwinden.
  async function applyExact() {
    setError(null)
    setApplying(true)
    try {
      for (const { asset, product } of exactMatches) {
        await setAssetProduct(asset.id, product.id)
      }
      const assigned = new Map(
        exactMatches.map((m) => [m.asset.id, m.product.id]),
      )
      setAssets((prev) =>
        prev.map((a) =>
          assigned.has(a.id) ? { ...a, product_id: assigned.get(a.id)! } : a,
        ),
      )
      setPreviewOpen(false)
    } catch {
      setError(t('assign.exactApplyError'))
    } finally {
      setApplying(false)
    }
  }

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  // Varianten je Artikel, für das Dropdown in der Zuordnungs-Karte.
  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>()
    for (const v of variants) {
      const list = map.get(v.product_id) ?? []
      list.push(v)
      map.set(v.product_id, list)
    }
    return map
  }, [variants])

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

      {/* Werkzeugleiste: Swatch-Filter + exakte Treffer übernehmen */}
      {!loading && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setHideSwatches((v) => !v)}
            aria-pressed={hideSwatches}
            className={[
              'rounded-full px-3 py-1.5 text-sm transition-colors border-[0.5px]',
              hideSwatches
                ? 'border-ink bg-ink text-cream'
                : 'border-line text-ink hover:bg-card',
            ].join(' ')}
          >
            {t('assign.hideSwatches')}
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={exactMatches.length === 0}
            className="ml-auto rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {t('assign.applyExact', { count: exactMatches.length })}
          </button>
        </div>
      )}

      {previewOpen && (
        <ExactPreview
          matches={exactMatches}
          applying={applying}
          onConfirm={applyExact}
          onCancel={() => setPreviewOpen(false)}
        />
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
              onAssign={(productId, variantId) =>
                assign(asset.id, productId, variantId)
              }
              onSkip={() => skip(asset.id)}
              productById={productById}
              variantsByProduct={variantsByProduct}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Vorschau-Dialog: alle exakten Treffer Bild → Artikel, Write erst auf OK. */
function ExactPreview({
  matches,
  applying,
  onConfirm,
  onCancel,
}: {
  matches: { asset: AssetWithMeta; product: Product }[]
  applying: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border-[0.5px] border-line bg-surface shadow-lg">
        <div className="border-b-[0.5px] border-line px-5 py-4">
          <h2 className="text-lg font-medium text-ink">
            {t('assign.exactPreviewTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted">{t('assign.exactPreviewHint')}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <ul className="flex flex-col gap-2">
            {matches.map(({ asset, product }) => (
              <li
                key={asset.id}
                className="flex items-center gap-3 rounded-md border-[0.5px] border-line bg-card px-3 py-2"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded border-[0.5px] border-line bg-surface">
                  {asset.url && (
                    <img
                      src={asset.url}
                      alt={asset.filename}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <span
                  className="min-w-0 flex-1 truncate text-sm text-muted"
                  title={asset.filename}
                >
                  {asset.filename}
                </span>
                <span className="text-muted">→</span>
                <span className="shrink-0 text-sm font-medium text-ink">
                  {productLabel(product)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-3 border-t-[0.5px] border-line px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-muted transition-colors hover:bg-card hover:text-ink disabled:opacity-50"
          >
            {t('assign.exactPreviewCancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={applying || matches.length === 0}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {applying ? t('common.saving') : t('assign.exactPreviewConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignCard({
  asset,
  products,
  onAssign,
  onSkip,
  productById,
  variantsByProduct,
}: {
  asset: AssetWithMeta
  products: Product[]
  onAssign: (productId: string, variantId: string | null) => Promise<void>
  onSkip: () => void
  productById: Map<string, Product>
  variantsByProduct: Map<string, ProductVariant[]>
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Variantenwahl gehört zum gewählten Artikel — bei Artikelwechsel zurücksetzen,
  // damit nie eine Variante des falschen Artikels gebucht wird.
  useEffect(() => {
    setSelectedVariantId(null)
  }, [selectedId])

  const variantOptions = selectedId
    ? (variantsByProduct.get(selectedId) ?? [])
    : []

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
    await onAssign(selectedId, selectedVariantId)
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

        {/* Variante (nur wenn der gewählte Artikel Varianten hat) */}
        {selectedId && variantOptions.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">{t('assign.variant')}</p>
            <select
              value={selectedVariantId ?? ''}
              onChange={(e) => setSelectedVariantId(e.target.value || null)}
              className="w-full max-w-sm rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            >
              <option value="">{t('assign.variantNone')}</option>
              {variantOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
