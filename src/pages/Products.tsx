import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '../lib/products'
import { listSeasons } from '../lib/seasons'
import { listActiveProducers } from '../lib/producers'
import { parseDecimalField } from '../lib/paymentTerms'
import {
  listArticleGroups,
  createArticleGroup,
} from '../lib/articleGroupsData'
import { validateGroupName } from '../lib/articleGroups'
import type { ArticleGroup } from '../types/articleGroup'
import ArticleGroupsManager from '../components/ArticleGroupsManager'
import {
  listVariantsByProduct,
  createVariant,
  deleteVariant,
} from '../lib/productVariants'
import {
  categoryLabel,
  PRODUCT_CATEGORIES,
  SIZE_SCHEMES,
  SIZE_SCHEME_LABEL_KEYS,
  type Product,
  type ProductInput,
} from '../types/product'
import type { Season } from '../types/asset'
import type { Producer } from '../types/producer'
import type { ProductVariant } from '../types/productVariant'
import EmptyState from '../components/EmptyState'
import type { TranslationKey } from '../i18n/dict'
import { useT } from '../i18n'

/** Preis (number oder numeric-String aus PostgREST) deutsch formatieren. */
function formatPrice(value: number | string | null): string {
  if (value === null || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/** Komma-getrennte Farbeingabe in ein sauberes Array wandeln. */
function parseColors(text: string): string[] {
  return text
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

/** Preistext (dt. Komma erlaubt) zu number oder null. */
function parsePrice(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

interface ProductForm {
  name: string
  category: string
  colorsText: string
  retail_price: string
  wholesale_price: string
  purchase_price: string
  season_id: string
  producer_id: string
  group_id: string
  composition: string
  size_scheme: string
  collection: string
  zuschlag: string
}

const emptyForm: ProductForm = {
  name: '',
  category: '',
  colorsText: '',
  retail_price: '',
  wholesale_price: '',
  purchase_price: '',
  season_id: '',
  producer_id: '',
  group_id: '',
  composition: '',
  size_scheme: '',
  collection: '',
  zuschlag: '',
}

export default function Products() {
  const t = useT()
  const [products, setProducts] = useState<Product[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [groups, setGroups] = useState<ArticleGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Gruppen-Verwaltung + Inline-Anlage im Formular.
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState<string | null>(null)

  const [seasonFilter, setSeasonFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Varianten des gerade bearbeiteten Artikels (sofort wirksam, wie Dokumente
  // beim Händler — Anlegen/Löschen läuft nicht über „Speichern").
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [variantInput, setVariantInput] = useState('')
  const [variantBusy, setVariantBusy] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [prods, seas, prod, grps] = await Promise.all([
        listProducts(),
        listSeasons(),
        listActiveProducers(),
        listArticleGroups(),
      ])
      setProducts(prods)
      setSeasons(seas)
      setProducers(prod)
      setGroups(grps)
    } catch {
      setError(t('products.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Escape schließt das Artikel-Modal (nur wenn offen).
  useEffect(() => {
    if (!formOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFormOpen(false)
        setEditing(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formOpen])

  // Varianten des bearbeiteten Artikels nachladen (nur im Bearbeiten-Modus).
  useEffect(() => {
    setVariantInput('')
    setVariantError(null)
    if (!editing) {
      setVariants([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const v = await listVariantsByProduct(editing.id)
        if (!cancelled) setVariants(v)
      } catch {
        if (!cancelled) setVariants([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing])

  async function addVariant() {
    const name = variantInput.trim()
    if (!editing || name === '') return
    // Doubletten je Artikel (case-insensitiv) still verwerfen — der Unique-Index
    // täte es auch, aber so ohne Fehlermeldung.
    if (variants.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      setVariantInput('')
      return
    }
    setVariantBusy(true)
    setVariantError(null)
    try {
      const created = await createVariant(editing.id, name)
      setVariants((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setVariantInput('')
    } catch {
      setVariantError(t('products.variantSaveError'))
    } finally {
      setVariantBusy(false)
    }
  }

  async function removeVariant(v: ProductVariant) {
    setVariantError(null)
    try {
      await deleteVariant(v.id)
      setVariants((prev) => prev.filter((x) => x.id !== v.id))
    } catch {
      // ON DELETE RESTRICT: Bilder zeigen noch auf die Variante.
      setVariantError(t('products.variantDeleteError', { name: v.name }))
    }
  }

  const seasonLabel = useMemo(() => {
    const map = new Map(seasons.map((s) => [s.id, s.label]))
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—')
  }, [seasons])

  // Kategorien für die Filter-Pills aus den tatsächlich vorhandenen Artikeln
  // ableiten (bekannte Reihenfolge zuerst, dann unbekannte Rohwerte).
  const availableCategories = useMemo(() => {
    const present = new Set(
      products.map((p) => p.category).filter((c): c is string => Boolean(c)),
    )
    const known = PRODUCT_CATEGORIES.filter((c) => present.has(c))
    const extra = [...present].filter(
      (c) => !PRODUCT_CATEGORIES.includes(c as never),
    )
    return [...known, ...extra]
  }, [products])

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (!seasonFilter || p.season_id === seasonFilter) &&
          (!categoryFilter || p.category === categoryFilter),
      ),
    [products, seasonFilter, categoryFilter],
  )

  function resetGroupInline() {
    setNewGroupOpen(false)
    setNewGroupName('')
    setGroupError(null)
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    resetGroupInline()
    setFormOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      category: p.category ?? '',
      colorsText: (p.color ?? []).join(', '),
      retail_price: p.retail_price === null ? '' : String(p.retail_price),
      wholesale_price:
        p.wholesale_price === null ? '' : String(p.wholesale_price),
      purchase_price:
        p.purchase_price === null ? '' : String(p.purchase_price),
      season_id: p.season_id ?? '',
      producer_id: p.producer_id ?? '',
      group_id: p.group_id ?? '',
      composition: p.composition ?? '',
      size_scheme: p.size_scheme ?? '',
      collection: p.collection ?? '',
      zuschlag: p.zuschlag === null ? '' : String(p.zuschlag),
    })
    setFormError(null)
    resetGroupInline()
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    resetGroupInline()
  }

  // Inline-Anlage einer neuen Gruppe direkt aus dem Artikel-Formular: validieren
  // (leer/Duplikat, block-statt-raten), anlegen, sofort auswählen.
  async function addGroupInline() {
    const parsed = validateGroupName(newGroupName, groups.map((g) => g.name))
    if (!parsed.ok) {
      setGroupError(t(parsed.error as TranslationKey))
      return
    }
    setGroupBusy(true)
    setGroupError(null)
    try {
      const created = await createArticleGroup(parsed.value)
      setGroups((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setForm((f) => ({ ...f, group_id: created.id }))
      resetGroupInline()
    } catch {
      setGroupError(t('products.group.saveError'))
    } finally {
      setGroupBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setFormError(t('common.nameRequired'))
      return
    }

    // EK-Preis Nepal strikt: leer = null (gültig), ungültig = sichtbarer Fehler
    // statt stillem Datenverlust (wie Skonto/Transportkosten).
    const ekParsed = parseDecimalField(form.purchase_price)
    if (!ekParsed.ok) {
      setFormError(t('products.field.purchaseInvalid'))
      return
    }

    // Zuschlag ebenso strikt: leer = null (gültig), ungültig = sichtbarer Fehler.
    // Wird NUR erfasst — hängt in keiner Preis-/Margenrechnung.
    const zuschlagParsed = parseDecimalField(form.zuschlag)
    if (!zuschlagParsed.ok) {
      setFormError(t('products.field.zuschlagInvalid'))
      return
    }

    const payload: ProductInput = {
      name,
      category: form.category || null,
      color: parseColors(form.colorsText).length
        ? parseColors(form.colorsText)
        : null,
      retail_price: parsePrice(form.retail_price),
      wholesale_price: parsePrice(form.wholesale_price),
      purchase_price: ekParsed.value,
      season_id: form.season_id || null,
      producer_id: form.producer_id || null,
      group_id: form.group_id || null,
      composition: form.composition.trim() || null,
      size_scheme: form.size_scheme || null,
      collection: form.collection.trim() || null,
      zuschlag: zuschlagParsed.value,
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateProduct(editing.id, payload)
      } else {
        await createProduct(payload)
      }
      closeForm()
      await load()
    } catch {
      setFormError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Product) {
    if (!window.confirm(t('products.deleteConfirm', { name: p.name }))) return
    try {
      await deleteProduct(p.id)
      await load()
    } catch {
      // Häufigster Fall: Produkt wird noch von einem Bild referenziert.
      setError(t('products.deleteError', { name: p.name }))
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'
  const pillClass = (active: boolean) =>
    [
      'rounded-full px-4 py-1.5 text-sm transition-colors',
      active
        ? 'bg-ink text-cream'
        : 'border-[0.5px] border-line text-ink hover:bg-card',
    ].join(' ')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('products.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('products.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupManagerOpen(true)}
            className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:border-ink"
          >
            {t('products.group.manage')}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
          >
            {t('products.add')}
          </button>
        </div>
      </div>

      {groupManagerOpen && (
        <ArticleGroupsManager
          groups={groups}
          products={products}
          onChanged={load}
          onClose={() => setGroupManagerOpen(false)}
        />
      )}

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter */}
      {(seasons.length > 0 || availableCategories.length > 0) && (
        <div className="mb-6 flex flex-col gap-3">
          {seasons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs uppercase tracking-wider text-muted">
                {t('common.season')}
              </span>
              <button
                type="button"
                onClick={() => setSeasonFilter(null)}
                className={pillClass(seasonFilter === null)}
              >
                {t('common.all')}
              </button>
              {seasons.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeasonFilter(s.id)}
                  className={pillClass(seasonFilter === s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {availableCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs uppercase tracking-wider text-muted">
                {t('common.category')}
              </span>
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={pillClass(categoryFilter === null)}
              >
                {t('common.all')}
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={pillClass(categoryFilter === c)}
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : products.length === 0 ? (
        <EmptyState actionLabel={t('products.create')} onAction={openCreate}>
          {t('products.empty')}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted">{t('products.noFilterMatch')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="px-4 py-3 font-medium">{t('common.category')}</th>
                <th className="px-4 py-3 font-medium">
                  {t('products.col.colors')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('products.col.retail')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('products.col.wholesale')}
                </th>
                <th className="px-4 py-3 font-medium">{t('common.season')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t-[0.5px] border-line bg-surface text-ink"
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {categoryLabel(p.category)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.color && p.color.length > 0 ? p.color.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatPrice(p.retail_price)}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatPrice(p.wholesale_price)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {seasonLabel(p.season_id)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4 py-8">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-cream shadow-xl">
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
              {/* Kopf (fix) — Titel + Schließen */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h2 className="text-lg font-medium text-ink">
                  {editing ? t('products.edit') : t('products.add')}
                </h2>
                <button
                  type="button"
                  onClick={closeForm}
                  aria-label={t('common.cancel')}
                  className="text-xl leading-none text-muted transition-colors hover:text-ink"
                >
                  ×
                </button>
              </div>

              {/* Inhalt (scrollt bei langem Formular) */}
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.nameReq')}
                </span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('common.category')}
                  </span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('common.season')}
                  </span>
                  <select
                    value={form.season_id}
                    onChange={(e) =>
                      setForm({ ...form, season_id: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.colors')}
                </span>
                <input
                  type="text"
                  value={form.colorsText}
                  onChange={(e) =>
                    setForm({ ...form, colorsText: e.target.value })
                  }
                  placeholder={t('products.field.colorsPlaceholder')}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.producer')}
                </span>
                <select
                  value={form.producer_id}
                  onChange={(e) =>
                    setForm({ ...form, producer_id: e.target.value })
                  }
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

              {/* Artikel-Gruppe für Auswertungen — offene Liste, Inline-Anlage. */}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('products.field.group')}</span>
                <select
                  value={form.group_id}
                  onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {!newGroupOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupOpen(true)
                      setGroupError(null)
                    }}
                    className="self-start text-xs text-muted transition-colors hover:text-ink"
                  >
                    {t('products.group.newToggle')}
                  </button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder={t('products.group.newPlaceholder')}
                        className={`${inputClass} flex-1`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={addGroupInline}
                        disabled={groupBusy}
                        className="shrink-0 rounded-md bg-ink px-3 py-2 text-sm text-cream disabled:opacity-50"
                      >
                        {t('products.group.add')}
                      </button>
                      <button
                        type="button"
                        onClick={resetGroupInline}
                        className="shrink-0 rounded-md border-[0.5px] border-line px-3 py-2 text-sm text-muted"
                      >
                        {t('products.group.cancel')}
                      </button>
                    </div>
                    {groupError && (
                      <span className="text-sm text-red-700">{groupError}</span>
                    )}
                  </div>
                )}
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('products.field.retail')}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.retail_price}
                    onChange={(e) =>
                      setForm({ ...form, retail_price: e.target.value })
                    }
                    placeholder="0,00"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('products.field.wholesale')}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.wholesale_price}
                    onChange={(e) =>
                      setForm({ ...form, wholesale_price: e.target.value })
                    }
                    placeholder="0,00"
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.purchase')}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.purchase_price}
                  onChange={(e) =>
                    setForm({ ...form, purchase_price: e.target.value })
                  }
                  placeholder="0,00"
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.quality')}
                </span>
                <textarea
                  rows={2}
                  value={form.composition}
                  onChange={(e) =>
                    setForm({ ...form, composition: e.target.value })
                  }
                  placeholder={t('products.field.qualityPlaceholder')}
                  className={inputClass}
                />
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('products.field.sizeScheme')}
                  </span>
                  <select
                    value={form.size_scheme}
                    onChange={(e) =>
                      setForm({ ...form, size_scheme: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {SIZE_SCHEMES.map((s) => (
                      <option key={s} value={s}>
                        {t(SIZE_SCHEME_LABEL_KEYS[s])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">
                    {t('products.field.collection')}
                  </span>
                  <input
                    type="text"
                    value={form.collection}
                    onChange={(e) =>
                      setForm({ ...form, collection: e.target.value })
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">
                  {t('products.field.zuschlag')}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.zuschlag}
                  onChange={(e) =>
                    setForm({ ...form, zuschlag: e.target.value })
                  }
                  placeholder="0,00"
                  className={inputClass}
                />
              </label>

              {/* Varianten (nur im Bearbeiten-Modus — Anlegen braucht product_id) */}
              {editing && (
                <div className="flex flex-col gap-2 border-t-[0.5px] border-line pt-4">
                  <span className="text-sm text-muted">
                    {t('products.variants')}
                  </span>
                  {variants.length === 0 ? (
                    <p className="text-xs text-muted">
                      {t('products.variantsEmpty')}
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {variants.map((v) => (
                        <li
                          key={v.id}
                          className="flex items-center gap-2 rounded-full border-[0.5px] border-line bg-surface px-3 py-1 text-sm text-ink"
                        >
                          {v.name}
                          <button
                            type="button"
                            onClick={() => removeVariant(v)}
                            aria-label={t('common.remove')}
                            className="text-muted transition-colors hover:text-red-700"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={variantInput}
                      onChange={(e) => setVariantInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addVariant()
                        }
                      }}
                      placeholder={t('products.variantPlaceholder')}
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={addVariant}
                      disabled={variantBusy || variantInput.trim() === ''}
                      className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
                    >
                      {t('products.variantAdd')}
                    </button>
                  </div>
                  {variantError && (
                    <p className="text-sm text-red-700">{variantError}</p>
                  )}
                </div>
              )}

              {formError && <p className="text-sm text-red-700">{formError}</p>}
              </div>

              {/* Fußzeile (fix, scrollt nicht weg) */}
              <div className="flex justify-end gap-3 border-t-[0.5px] border-line px-6 py-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
