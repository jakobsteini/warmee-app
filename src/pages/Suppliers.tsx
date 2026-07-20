import { useEffect, useState, type FormEvent } from 'react'
import {
  listProducers,
  createProducer,
  updateProducer,
} from '../lib/producers'
import type { Producer, ProducerInput } from '../types/producer'
import { COUNTRIES, countryLabel } from '../lib/countries'
import EmptyState from '../components/EmptyState'
import { useI18n } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

interface SupplierForm {
  name: string
  country: string
  contact_person: string
  contact_person_alt: string
  email: string
  address: string
  uid: string
  active: boolean
}

const emptyForm: SupplierForm = {
  name: '',
  country: '',
  contact_person: '',
  contact_person_alt: '',
  email: '',
  address: '',
  uid: '',
  active: true,
}

function trimOrNull(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

export default function Suppliers() {
  const { t, lang } = useI18n()
  const [suppliers, setSuppliers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Producer | null>(null)
  const [form, setForm] = useState<SupplierForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setSuppliers(await listProducers())
    } catch {
      setError(t('suppliers.loadError'))
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

  function openEdit(p: Producer) {
    setEditing(p)
    setForm({
      name: p.name,
      country: p.country ?? '',
      contact_person: p.contact_person ?? '',
      contact_person_alt: p.contact_person_alt ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      uid: p.uid ?? '',
      active: p.active,
    })
    setFormError(null)
    setFormOpen(true)
  }

  function set<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError(t('common.nameRequired'))
      return
    }
    const payload: ProducerInput = {
      name: form.name.trim(),
      country: trimOrNull(form.country),
      contact_person: trimOrNull(form.contact_person),
      contact_person_alt: trimOrNull(form.contact_person_alt),
      email: trimOrNull(form.email),
      address: trimOrNull(form.address),
      uid: trimOrNull(form.uid),
      active: form.active,
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) await updateProducer(editing.id, payload)
      else await createProducer(payload)
      setFormOpen(false)
      setEditing(null)
      await load()
    } catch {
      setFormError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('suppliers.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('suppliers.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-md bg-ink px-4 py-2 text-sm text-cream"
        >
          {t('suppliers.add')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : suppliers.length === 0 ? (
        <EmptyState actionLabel={t('suppliers.add')} onAction={openCreate}>
          {t('suppliers.empty')}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border-[0.5px] border-line">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('suppliers.col.name')}</th>
                <th className="px-4 py-3 font-medium">{t('suppliers.col.contact')}</th>
                <th className="px-4 py-3 font-medium">{t('suppliers.col.email')}</th>
                <th className="px-4 py-3 font-medium">{t('suppliers.col.country')}</th>
                <th className="px-4 py-3 font-medium">{t('suppliers.col.active')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((p) => (
                <tr key={p.id} className="border-t-[0.5px] border-line">
                  <td className="px-4 py-2 text-ink">{p.name}</td>
                  <td className="px-4 py-2 text-muted">{p.contact_person ?? '—'}</td>
                  <td className="px-4 py-2 text-muted">{p.email ?? '—'}</td>
                  <td className="px-4 py-2 text-muted">
                    {p.country ? countryLabel(p.country, lang) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        p.active ? 'text-ink' : 'text-muted'
                      }
                    >
                      {p.active ? t('suppliers.active') : t('suppliers.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {t('common.edit')}
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
          <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-medium text-ink">
              {editing ? t('suppliers.edit') : t('suppliers.add')}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('suppliers.field.nameReq')}</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputClass}
                />
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">{t('suppliers.field.contact')}</span>
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={(e) => set('contact_person', e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">{t('suppliers.field.contactAlt')}</span>
                  <input
                    type="text"
                    value={form.contact_person_alt}
                    onChange={(e) => set('contact_person_alt', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('suppliers.field.email')}</span>
                <input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">{t('suppliers.field.address')}</span>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className={inputClass}
                />
              </label>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">{t('suppliers.field.country')}</span>
                  <select
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {countryLabel(c.code, lang)} ({c.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm text-muted">{t('suppliers.field.uid')}</span>
                  <input
                    type="text"
                    value={form.uid}
                    onChange={(e) => set('uid', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => set('active', e.target.checked)}
                />
                {t('suppliers.field.active')}
              </label>

              {formError && <p className="text-sm text-red-700">{formError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false)
                    setEditing(null)
                  }}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-muted"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
