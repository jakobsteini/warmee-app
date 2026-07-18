import { useMemo, useState, type FormEvent } from 'react'
import { parseIntField } from '../lib/paymentTerms'
import { createMovement } from '../lib/inventory'
import type { InventoryGrund, Warehouse } from '../types/inventory'
import { WAREHOUSES } from '../types/inventory'
import type { Product } from '../types/product'
import type { ProductVariant } from '../types/productVariant'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Buchungsart → Grund + Vorzeichen. Die Menge tippt der Nutzer immer positiv;
 * das Vorzeichen kommt aus der Auswahl (Bewegungskonto denkt in Bewegungen,
 * nie in einem absoluten Zielwert). */
const BUCHUNGSARTEN: {
  key: string
  labelKey: TranslationKey
  grund: InventoryGrund
  sign: 1 | -1
}[] = [
  { key: 'zugang', labelKey: 'inventory.movement.type.zugang', grund: 'manuell', sign: 1 },
  { key: 'abgang', labelKey: 'inventory.movement.type.abgang', grund: 'manuell', sign: -1 },
  { key: 'korrekturPlus', labelKey: 'inventory.movement.type.korrekturPlus', grund: 'korrektur', sign: 1 },
  { key: 'korrekturMinus', labelKey: 'inventory.movement.type.korrekturMinus', grund: 'korrektur', sign: -1 },
]

function warehouseLabelKey(w: Warehouse): TranslationKey {
  return `inventory.warehouse.${w}` as TranslationKey
}

/**
 * Manuelle Bestandsbewegung erfassen: Zugang / Abgang / Korrektur als Buchung.
 * Menge über parseIntField (strikt — ungültig → sichtbarer Fehler, kein stiller
 * Datenverlust). Variante ist optional (nur wenn der Artikel Varianten hat) und
 * wird nie erzwungen.
 */
export default function InventoryMovementModal({
  products,
  variants,
  onClose,
  onSaved,
}: {
  products: Product[]
  variants: ProductVariant[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [warehouse, setWarehouse] = useState<Warehouse>('bestand')
  const [artKey, setArtKey] = useState('zugang')
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  )
  const productVariants = useMemo(
    () => variants.filter((v) => v.product_id === productId),
    [variants, productId],
  )
  const colorOptions = product?.color ?? []

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!productId) {
      setError(t('inventory.movement.chooseArticle'))
      return
    }
    const parsed = parseIntField(qty)
    if (!parsed.ok || parsed.value === null || parsed.value < 1) {
      setError(t('inventory.movement.invalidQty'))
      return
    }
    const art = BUCHUNGSARTEN.find((a) => a.key === artKey)!

    setBusy(true)
    setError(null)
    try {
      await createMovement({
        product_id: productId,
        variant_id: variantId || null,
        color: color.trim() || null,
        size: size.trim() || null,
        warehouse,
        menge: art.sign * parsed.value,
        grund: art.grund,
      })
      onSaved()
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="text-lg font-medium text-ink">{t('inventory.movement.title')}</h2>
        <p className="mb-4 text-sm text-muted">{t('inventory.movement.desc')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.article')}</span>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value)
                setVariantId('') // Variante gehört zum Artikel — bei Wechsel zurücksetzen
              }}
              className={inputClass}
            >
              <option value="">{t('common.select')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {productVariants.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t('inventory.movement.variant')}</span>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('inventory.movement.variantNone')}</option>
                {productVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t('common.color')}</span>
              <input
                list="inv-colors"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className={inputClass}
              />
              {colorOptions.length > 0 && (
                <datalist id="inv-colors">
                  {colorOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              )}
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t('common.size')}</span>
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t('inventory.col.warehouse')}</span>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as Warehouse)}
                className={inputClass}
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {t(warehouseLabelKey(w))}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t('inventory.movement.type')}</span>
              <select
                value={artKey}
                onChange={(e) => setArtKey(e.target.value)}
                className={inputClass}
              >
                {BUCHUNGSARTEN.map((a) => (
                  <option key={a.key} value={a.key}>
                    {t(a.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-24 flex-col gap-1.5">
              <span className="text-xs text-muted">{t('common.quantity')}</span>
              <input
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={`${inputClass} text-right`}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
