import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '../lib/products'
import { listSeasons } from '../lib/seasons'
import {
  categoryLabel,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductInput,
} from '../types/product'
import type { Season } from '../types/asset'
import EmptyState from '../components/EmptyState'

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
  season_id: string
}

const emptyForm: ProductForm = {
  name: '',
  category: '',
  colorsText: '',
  retail_price: '',
  wholesale_price: '',
  season_id: '',
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [seasonFilter, setSeasonFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [prods, seas] = await Promise.all([listProducts(), listSeasons()])
      setProducts(prods)
      setSeasons(seas)
    } catch {
      setError('Artikel konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
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
      season_id: p.season_id ?? '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setFormError('Name ist erforderlich.')
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
      season_id: form.season_id || null,
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
      setFormError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Product) {
    if (!window.confirm(`Artikel „${p.name}" wirklich löschen?`)) return
    try {
      await deleteProduct(p.id)
      await load()
    } catch {
      // Häufigster Fall: Produkt wird noch von einem Bild referenziert.
      setError(
        `„${p.name}" konnte nicht gelöscht werden – wird es noch von Bildern oder Newsletter verwendet?`,
      )
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'
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
          <h1 className="text-2xl font-medium text-ink">Artikel</h1>
          <p className="mt-1 text-sm text-muted">
            Produktkatalog – Stammdaten, Farben, Preise und Saison.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
        >
          Artikel hinzufügen
        </button>
      </div>

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
                Saison
              </span>
              <button
                type="button"
                onClick={() => setSeasonFilter(null)}
                className={pillClass(seasonFilter === null)}
              >
                Alle
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
                Kategorie
              </span>
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={pillClass(categoryFilter === null)}
              >
                Alle
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
        <p className="text-sm text-muted">Lädt…</p>
      ) : products.length === 0 ? (
        <EmptyState actionLabel="Artikel anlegen" onAction={openCreate}>
          Hier pflegst du den Artikelkatalog – Name, Farbe, Größe und Preise je
          Saison. Lege den ersten Artikel an.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted">
            Keine Artikel für diese Filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 font-medium">Farben</th>
                <th className="px-4 py-3 font-medium">Endkunde</th>
                <th className="px-4 py-3 font-medium">Großhandel</th>
                <th className="px-4 py-3 font-medium">Saison</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t-[0.5px] border-line bg-white text-ink"
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
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="ml-4 text-muted transition-colors hover:text-red-700"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-medium text-ink">
              {editing ? 'Artikel bearbeiten' : 'Artikel hinzufügen'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Name *</span>
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
                  <span className="text-sm text-muted">Kategorie</span>
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
                  <span className="text-sm text-muted">Saison</span>
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
                  Farben (Komma-getrennt)
                </span>
                <input
                  type="text"
                  value={form.colorsText}
                  onChange={(e) =>
                    setForm({ ...form, colorsText: e.target.value })
                  }
                  placeholder="z. B. Camel, Anthrazit, Creme"
                  className={inputClass}
                />
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">Endkundenpreis (€)</span>
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
                  <span className="text-sm text-muted">Großhandelspreis (€)</span>
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

              {formError && <p className="text-sm text-red-700">{formError}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
