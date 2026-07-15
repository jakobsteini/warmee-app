import { useEffect, useState, type FormEvent } from 'react'
import {
  listDunningLevels,
  createDunningLevel,
  updateDunningLevel,
  deleteDunningLevel,
  reorderDunningLevels,
} from '../lib/dunning'
import type { DunningLevel } from '../types/dunning'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/** Ganzzahl ≥ 0 aus String, oder null. */
function intOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Dezimalbetrag ≥ 0 aus String (Dezimalkomma erlaubt), oder null. */
function decOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isNaN(n) || n < 0 ? null : n
}

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Editierbarer Entwurf einer Stufe (Zahlen als String, damit Tippen frei ist). */
interface Draft {
  id: string
  level_number: number
  label: string
  days: string
  fee: string
  triggers_collection: boolean
}

function toDraft(l: DunningLevel): Draft {
  return {
    id: l.id,
    level_number: l.level_number,
    label: l.label,
    days: String(l.days_after_due),
    fee: String(typeof l.fee === 'string' ? Number(l.fee) : l.fee),
    triggers_collection: l.triggers_collection,
  }
}

export default function DunningSettings() {
  const t = useT()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Neue Stufe
  const [newLabel, setNewLabel] = useState('')
  const [newDays, setNewDays] = useState('')
  const [newFee, setNewFee] = useState('0')
  const [newCollection, setNewCollection] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const levels = await listDunningLevels()
      setDrafts(levels.map(toDraft))
    } catch {
      setError(t('dunning.settings.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }

  async function saveRow(d: Draft) {
    const days = intOrNull(d.days)
    const fee = decOrNull(d.fee)
    if (d.label.trim() === '' || days === null || fee === null) {
      setError(t('dunning.settings.rowInvalid'))
      return
    }
    setSavingId(d.id)
    setError(null)
    try {
      await updateDunningLevel(d.id, {
        label: d.label.trim(),
        days_after_due: days,
        fee,
        triggers_collection: d.triggers_collection,
      })
      await load()
    } catch {
      setError(t('dunning.settings.saveError'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(d: Draft) {
    if (!window.confirm(t('dunning.settings.deleteConfirm', { label: d.label })))
      return
    setError(null)
    try {
      await deleteDunningLevel(d.id)
      await load()
    } catch {
      setError(t('dunning.settings.deleteError'))
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= drafts.length) return
    const reordered = [...drafts]
    const [item] = reordered.splice(index, 1)
    reordered.splice(target, 0, item)
    // Optimistisch anzeigen, dann persistieren.
    setDrafts(reordered)
    setError(null)
    try {
      await reorderDunningLevels(reordered.map((d) => d.id))
      await load()
    } catch {
      setError(t('dunning.settings.reorderError'))
      await load()
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const days = intOrNull(newDays)
    const fee = decOrNull(newFee)
    if (newLabel.trim() === '' || days === null || fee === null) {
      setAddError(t('dunning.settings.addIncomplete'))
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await createDunningLevel({
        // Neue Stufe hinten anstellen.
        level_number: drafts.length + 1,
        label: newLabel.trim(),
        days_after_due: days,
        fee,
        triggers_collection: newCollection,
      })
      setNewLabel('')
      setNewDays('')
      setNewFee('0')
      setNewCollection(false)
      await load()
    } catch {
      setAddError(t('dunning.settings.addError'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">
            {t('dunning.settings.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('dunning.settings.subtitle')}
          </p>
        </div>
        <Link
          to="/dunning"
          className="shrink-0 text-sm text-muted transition-colors hover:text-ink"
        >
          {t('dunning.settings.toOverview')}
        </Link>
      </div>

      <div className="mb-6 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-muted">
        {t('dunning.settings.hint')}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">
                    {t('dunning.col.number')}
                  </th>
                  <th className="px-3 py-3 font-medium">
                    {t('dunning.col.label')}
                  </th>
                  <th className="px-3 py-3 font-medium">
                    {t('dunning.col.days')}
                  </th>
                  <th className="px-3 py-3 font-medium">
                    {t('dunning.col.fee')}
                  </th>
                  <th className="px-3 py-3 font-medium">
                    {t('dunning.col.collection')}
                  </th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 ? (
                  <tr className="border-t-[0.5px] border-line bg-surface">
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-muted"
                    >
                      {t('dunning.settings.empty')}
                    </td>
                  </tr>
                ) : (
                  drafts.map((d, i) => (
                    <tr
                      key={d.id}
                      className="border-t-[0.5px] border-line bg-surface align-middle text-ink"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{i + 1}</span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => move(i, -1)}
                              disabled={i === 0}
                              aria-label={t('dunning.moveUp')}
                              className="leading-none text-muted transition-colors hover:text-ink disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => move(i, 1)}
                              disabled={i === drafts.length - 1}
                              aria-label={t('dunning.moveDown')}
                              className="leading-none text-muted transition-colors hover:text-ink disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={d.label}
                          onChange={(e) =>
                            patchDraft(d.id, { label: e.target.value })
                          }
                          className={`${inputClass} w-full min-w-[10rem]`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={d.days}
                          onChange={(e) =>
                            patchDraft(d.id, { days: e.target.value })
                          }
                          className={`${inputClass} w-20`}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={d.fee}
                          onChange={(e) =>
                            patchDraft(d.id, { fee: e.target.value })
                          }
                          className={`${inputClass} w-24`}
                        />
                        <span className="ml-1 text-muted">€</span>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={d.triggers_collection}
                          onChange={(e) =>
                            patchDraft(d.id, {
                              triggers_collection: e.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-ink"
                        />
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => saveRow(d)}
                          disabled={savingId === d.id}
                          className="text-ink transition-opacity hover:opacity-70 disabled:opacity-40"
                        >
                          {savingId === d.id
                            ? t('common.saving')
                            : t('common.save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          className="ml-4 text-muted transition-colors hover:text-red-700"
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

          {/* Neue Stufe */}
          <section className="mt-8 rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
            <h2 className="text-lg font-medium text-ink">
              {t('dunning.settings.addTitle')}
            </h2>
            <form
              onSubmit={handleAdd}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                <span className="text-xs text-muted">
                  {t('dunning.col.label')}
                </span>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">
                  {t('dunning.col.days')}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">
                  {t('dunning.col.fee')}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={newCollection}
                  onChange={(e) => setNewCollection(e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm text-ink">
                  {t('dunning.col.collection')}
                </span>
              </label>
              <button
                type="submit"
                disabled={adding}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {adding ? t('dunning.settings.adding') : t('dunning.settings.add')}
              </button>
            </form>
            {addError && <p className="mt-2 text-sm text-red-700">{addError}</p>}
          </section>
        </>
      )}
    </div>
  )
}
