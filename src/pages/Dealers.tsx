import { useEffect, useState, type FormEvent } from 'react'
import type { Dealer, DealerInput } from '../types/dealer'
import {
  listDealers,
  createDealer,
  updateDealer,
  deleteDealer,
} from '../lib/dealers'
import EmptyState from '../components/EmptyState'

const emptyForm: DealerInput = {
  name: '',
  contact_name: '',
  email: '',
  city: '',
  country: 'AT',
}

/** Leere Strings zu null normalisieren, damit die DB null statt '' speichert. */
function normalize(input: DealerInput): DealerInput {
  const trim = (v: string | null) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  return {
    name: (input.name ?? '').trim(),
    contact_name: trim(input.contact_name),
    email: trim(input.email),
    city: trim(input.city),
    country: trim(input.country),
  }
}

export default function Dealers() {
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Dealer | null>(null)
  const [form, setForm] = useState<DealerInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setDealers(await listDealers())
    } catch {
      setError('Händler konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(d: Dealer) {
    setEditing(d)
    setForm({
      name: d.name,
      contact_name: d.contact_name ?? '',
      email: d.email ?? '',
      city: d.city ?? '',
      country: d.country ?? 'AT',
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
    const payload = normalize(form)
    if (!payload.name) {
      setFormError('Name ist erforderlich.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateDealer(editing.id, payload)
      } else {
        await createDealer(payload)
      }
      closeForm()
      await load()
    } catch {
      setFormError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(d: Dealer) {
    if (!window.confirm(`Händler „${d.name}" wirklich löschen?`)) return
    try {
      await deleteDealer(d.id)
      await load()
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }

  const inputClass =
    'rounded-md border-[0.5px] border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-ink">Händler</h1>
          <p className="mt-1 text-sm text-muted">
            Schlanke Liste für den Newsletter-Versand.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90"
        >
          Händler hinzufügen
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : dealers.length === 0 ? (
        <EmptyState actionLabel="Händler hinzufügen" onAction={openCreate}>
          Hier verwaltest du deine Fachhandels-Kontakte für den
          Newsletter-Versand. Lege den ersten Händler an.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Ansprechpartner</th>
                <th className="px-4 py-3 font-medium">E-Mail</th>
                <th className="px-4 py-3 font-medium">Ort</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr
                  key={d.id}
                  className="border-t-[0.5px] border-line bg-white text-ink"
                >
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-muted">{d.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{d.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {[d.city, d.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
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
              {editing ? 'Händler bearbeiten' : 'Händler hinzufügen'}
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
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Ansprechpartner</span>
                <input
                  type="text"
                  value={form.contact_name ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, contact_name: e.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">E-Mail</span>
                <input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </label>
              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">Stadt</span>
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex w-24 flex-col gap-1.5">
                  <span className="text-sm text-muted">Land</span>
                  <input
                    type="text"
                    value={form.country ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, country: e.target.value })
                    }
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
