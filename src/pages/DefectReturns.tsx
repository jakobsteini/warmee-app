import { useEffect, useState, type FormEvent } from 'react'
import {
  listDefectReturns,
  createDefectReturn,
  deleteDefectReturn,
} from '../lib/defectReturns'
import { validateDefectReturn } from '../lib/defectReturnCalc'
import { listProducts } from '../lib/products'
import { listProducers } from '../lib/producers'
import { formatEUR } from '../lib/money'
import type { DefectReturnWithRefs } from '../types/defectReturn'
import type { Product } from '../types/product'
import type { Producer } from '../types/producer'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Nicht-negative Dezimalzahl (Komma erlaubt) oder null bei leer/ungültig. */
function parseMoney(v: string): number | null {
  const s = v.trim()
  if (s === '') return null
  const n = Number(s.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const EMPTY = {
  product_id: '',
  article_text: '',
  color: '',
  size: '',
  quantity: '1',
  producer_id: '',
  beleg_bezug: '',
  value_ek: '',
  value_vk: '',
  defect_note: '',
}

export default function DefectReturns() {
  const t = useT()
  const [rows, setRows] = useState<DefectReturnWithRefs[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [form, setForm] = useState({ ...EMPTY })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [r, p, pr] = await Promise.all([
      listDefectReturns(),
      listProducts().catch(() => []),
      listProducers().catch(() => []),
    ])
    setRows(r)
    setProducts(p)
    setProducers(pr)
  }

  useEffect(() => {
    load().catch(() => setError(t('defectReturns.loadError')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const quantity = parseInt(form.quantity, 10)
    const check = validateDefectReturn({
      product_id: form.product_id || null,
      article_text: form.article_text || null,
      quantity,
    })
    if (!check.ok) {
      setError(t(check.errorKey as Parameters<typeof t>[0]))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createDefectReturn({
        product_id: form.product_id || null,
        article_text: form.article_text.trim() || null,
        color: form.color.trim() || null,
        size: form.size.trim() || null,
        quantity,
        producer_id: form.producer_id || null,
        beleg_bezug: form.beleg_bezug.trim() || null,
        value_ek: parseMoney(form.value_ek),
        value_vk: parseMoney(form.value_vk),
        defect_note: form.defect_note.trim() || null,
      })
      setForm({ ...EMPTY })
      await load()
    } catch {
      setError(t('defectReturns.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('defectReturns.deleteConfirm'))) return
    try {
      await deleteDefectReturn(id)
      await load()
    } catch {
      setError(t('defectReturns.saveError'))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-medium text-ink">{t('defectReturns.title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t('defectReturns.subtitle')}</p>

      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-md border-[0.5px] border-line bg-surface p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.article')}</span>
            <select
              value={form.product_id}
              onChange={(e) => set('product_id', e.target.value)}
              className={inputClass}
            >
              <option value="">{t('defectReturns.articleFreeText')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.articleText')}</span>
            <input
              type="text"
              value={form.article_text}
              onChange={(e) => set('article_text', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.producer')}</span>
            <select
              value={form.producer_id}
              onChange={(e) => set('producer_id', e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.color')}</span>
            <input
              type="text"
              value={form.color}
              onChange={(e) => set('color', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('common.size')}</span>
            <input
              type="text"
              value={form.size}
              onChange={(e) => set('size', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.quantity')}</span>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.belegBezug')}</span>
            <input
              type="text"
              value={form.beleg_bezug}
              onChange={(e) => set('beleg_bezug', e.target.value)}
              placeholder={t('defectReturns.belegBezugPlaceholder')}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.valueEk')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.value_ek}
              onChange={(e) => set('value_ek', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('defectReturns.valueVk')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.value_vk}
              onChange={(e) => set('value_vk', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <span className="text-xs text-muted">{t('defectReturns.defectNote')}</span>
            <input
              type="text"
              value={form.defect_note}
              onChange={(e) => set('defect_note', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t('defectReturns.add')}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t('common.date')}</th>
              <th className="px-4 py-3 font-medium">{t('defectReturns.article')}</th>
              <th className="px-4 py-3 font-medium">{t('defectReturns.producer')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('defectReturns.quantity')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('defectReturns.valueEk')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('defectReturns.valueVk')}</th>
              <th className="px-4 py-3 font-medium">{t('defectReturns.belegBezug')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t-[0.5px] border-line bg-surface">
                <td colSpan={8} className="px-4 py-6 text-center text-muted">
                  {t('defectReturns.none')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t-[0.5px] border-line bg-surface text-ink">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {r.product?.name ?? r.article_text ?? '—'}
                    {(r.color || r.size) && (
                      <span className="text-muted">
                        {' '}· {[r.color, r.size].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {r.defect_note && (
                      <span className="block text-xs text-muted">{r.defect_note}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{r.producer?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.value_ek != null ? formatEUR(r.value_ek) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.value_vk != null ? formatEUR(r.value_vk) : '—'}
                  </td>
                  <td className="px-4 py-2.5">{r.beleg_bezug ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="text-muted transition-colors hover:text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
