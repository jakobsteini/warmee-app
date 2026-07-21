import { useState } from 'react'
import { renameArticleGroup, deleteArticleGroup } from '../lib/articleGroupsData'
import { validateGroupName, groupInUse, groupArticleCounts } from '../lib/articleGroups'
import type { ArticleGroup } from '../types/articleGroup'
import type { TranslationKey } from '../i18n/dict'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Verwaltung der Artikel-Gruppen: umbenennen (wirkt zentral, da group_id
 * referenziert) und löschen. Löschen ist gesperrt, solange Artikel an der Gruppe
 * hängen (block-statt-raten, sichtbare Meldung statt DB-Fehler). Anlegen läuft
 * bewusst über das Artikel-Formular (Inline-Anlage) — hier nur Pflege.
 */
export default function ArticleGroupsManager({
  groups,
  products,
  onChanged,
  onClose,
}: {
  groups: ArticleGroup[]
  products: { group_id: string | null }[]
  onChanged: () => Promise<void> | void
  onClose: () => void
}) {
  const t = useT()
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.name])),
  )
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { counts } = groupArticleCounts(products, groups)
  const countById = new Map(counts.map((c) => [c.id, c.count]))

  async function handleRename(g: ArticleGroup) {
    const proposed = names[g.id] ?? g.name
    if (proposed.trim() === g.name) return // unverändert
    const others = groups.filter((x) => x.id !== g.id).map((x) => x.name)
    const parsed = validateGroupName(proposed, others)
    if (!parsed.ok) {
      setError(t(parsed.error as TranslationKey))
      return
    }
    setBusyId(g.id)
    setError(null)
    try {
      await renameArticleGroup(g.id, parsed.value)
      await onChanged()
    } catch {
      setError(t('products.group.saveError'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(g: ArticleGroup) {
    // Block-statt-raten: Gruppe mit Artikeln lässt sich nicht löschen.
    if (groupInUse(g.id, products)) {
      setError(t('products.group.deleteInUse', { name: g.name }))
      return
    }
    if (!window.confirm(t('products.group.deleteConfirm', { name: g.name }))) return
    setBusyId(g.id)
    setError(null)
    try {
      await deleteArticleGroup(g.id)
      await onChanged()
    } catch {
      setError(t('products.group.deleteError'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">
          {t('products.group.manageTitle')}
        </h2>
        <p className="mb-4 text-xs text-muted">{t('products.group.manageHint')}</p>

        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

        {groups.length === 0 ? (
          <p className="text-sm text-muted">{t('products.group.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={names[g.id] ?? g.name}
                  onChange={(e) =>
                    setNames((prev) => ({ ...prev, [g.id]: e.target.value }))
                  }
                  className={`${inputClass} flex-1`}
                />
                <span className="w-20 shrink-0 text-right text-xs text-muted">
                  {t('products.group.count', { count: countById.get(g.id) ?? 0 })}
                </span>
                <button
                  type="button"
                  onClick={() => handleRename(g)}
                  disabled={busyId === g.id}
                  className="shrink-0 rounded-md border-[0.5px] border-line px-2.5 py-1.5 text-xs text-ink disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(g)}
                  disabled={busyId === g.id}
                  className="shrink-0 rounded-md border-[0.5px] border-red-300 px-2.5 py-1.5 text-xs text-red-700 disabled:opacity-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
