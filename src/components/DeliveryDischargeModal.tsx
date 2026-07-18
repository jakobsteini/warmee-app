import { useEffect, useState, type FormEvent } from 'react'
import { parseIntField } from '../lib/paymentTerms'
import {
  createMovements,
  getDeliveryDischargeProposal,
} from '../lib/inventory'
import { listProducts } from '../lib/products'
import { listAllVariants } from '../lib/productVariants'
import type { MovementInput, Warehouse } from '../types/inventory'
import { WAREHOUSES } from '../types/inventory'
import type { ProductVariant } from '../types/productVariant'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

function warehouseLabelKey(w: Warehouse): TranslationKey {
  return `inventory.warehouse.${w}` as TranslationKey
}

/** Eine Vorschlagszeile, angereichert um Name + wählbare Variante + editierbare Menge. */
interface Row {
  product_id: string
  productName: string
  color: string | null
  size: string | null
  qty: string
  variantId: string
  variants: ProductVariant[]
}

/**
 * Ein-Klick-Ausbuchung eines Lieferscheins: die Vorschlagsmengen kommen aus
 * proposeDeliveryDischarge (negativ). Der Mitarbeiter wählt das Lager (Default
 * Bestandslager), kann je Position die Menge korrigieren und eine Variante
 * zuweisen (optional — die Automatik rät nie eine Variante), dann bestätigen →
 * Bewegungen mit grund='lieferschein' und delivery_id. Menge strikt über
 * parseIntField. Die Doppelbuchungs-Sperre sitzt im aufrufenden DeliveryEdit.
 */
export default function DeliveryDischargeModal({
  deliveryId,
  onClose,
  onDone,
}: {
  deliveryId: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [warehouse, setWarehouse] = useState<Warehouse>('bestand')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [proposal, products, variants] = await Promise.all([
          getDeliveryDischargeProposal(deliveryId, 'bestand'),
          listProducts(),
          listAllVariants(),
        ])
        if (!alive) return
        const nameById = new Map(products.map((p) => [p.id, p.name]))
        setRows(
          proposal.map((m) => ({
            product_id: m.product_id,
            productName: nameById.get(m.product_id) ?? '—',
            color: m.color ?? null,
            size: m.size ?? null,
            qty: String(Math.abs(m.menge)), // Vorschlag positiv anzeigen
            variantId: '',
            variants: variants.filter((v) => v.product_id === m.product_id),
          })),
        )
      } catch {
        if (alive) setLoadError(t('inventory.discharge.loadError'))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [deliveryId, t])

  function patchRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (rows.length === 0) {
      setError(t('inventory.discharge.nothing'))
      return
    }
    const inputs: MovementInput[] = []
    for (const r of rows) {
      const parsed = parseIntField(r.qty)
      if (!parsed.ok || parsed.value === null || parsed.value < 1) {
        setError(t('inventory.movement.invalidQty'))
        return
      }
      inputs.push({
        product_id: r.product_id,
        variant_id: r.variantId || null,
        color: r.color,
        size: r.size,
        warehouse,
        menge: -parsed.value, // Abgang negativ
        grund: 'lieferschein',
        delivery_id: deliveryId,
      })
    }

    setBusy(true)
    setError(null)
    try {
      await createMovements(inputs)
      onDone()
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="text-lg font-medium text-ink">{t('inventory.discharge.title')}</h2>
        <p className="mb-4 text-sm text-muted">{t('inventory.discharge.desc')}</p>

        {loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-red-700">{loadError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('inventory.discharge.nothing')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex max-w-xs flex-col gap-1.5">
              <span className="text-xs text-muted">{t('inventory.discharge.fromWarehouse')}</span>
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

            <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-card text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('common.article')}</th>
                    <th className="px-3 py-2 font-medium">{t('common.color')}</th>
                    <th className="px-3 py-2 font-medium">{t('common.size')}</th>
                    <th className="px-3 py-2 font-medium">{t('inventory.col.variant')}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('inventory.discharge.col.removal')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-t-[0.5px] border-line bg-surface text-ink">
                      <td className="px-3 py-2 font-medium">{r.productName}</td>
                      <td className="px-3 py-2">{r.color ?? '—'}</td>
                      <td className="px-3 py-2">{r.size ?? '—'}</td>
                      <td className="px-3 py-2">
                        {r.variants.length > 0 ? (
                          <select
                            value={r.variantId}
                            onChange={(e) => patchRow(idx, { variantId: e.target.value })}
                            className={`${inputClass} py-1`}
                          >
                            <option value="">{t('inventory.movement.variantNone')}</option>
                            {r.variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          inputMode="numeric"
                          value={r.qty}
                          onChange={(e) => patchRow(idx, { qty: e.target.value })}
                          className={`${inputClass} w-20 text-right`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                {busy ? t('common.saving') : t('inventory.discharge.confirm')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
