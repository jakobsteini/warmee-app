import { categoryLabel } from '../types/product'
import { useT } from '../i18n'

/**
 * Gemeinsame Such-/Filter-Leiste für Bildarchiv und Zuschnitt. Suchfeld +
 * Produktgruppen-Select. Die Gruppen kommen als Kategorie-Rohwerte herein und
 * werden hier deutsch gelabelt. Ein Baustein, in beiden Seiten genutzt.
 */
export default function AssetFilterBar({
  search,
  onSearchChange,
  group,
  onGroupChange,
  groups,
  count,
}: {
  search: string
  onSearchChange: (v: string) => void
  group: string | null
  onGroupChange: (v: string | null) => void
  /** Vorkommende Produktgruppen (products.category-Rohwerte). */
  groups: string[]
  /** Trefferzahl nach Filterung (optional angezeigt). */
  count?: number
}) {
  const t = useT()
  const controlClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t('assets.search.placeholder')}
        className={`min-w-[16rem] flex-1 ${controlClass}`}
      />
      {groups.length > 0 && (
        <select
          value={group ?? ''}
          onChange={(e) => onGroupChange(e.target.value || null)}
          className={controlClass}
        >
          <option value="">{t('assets.filter.allGroups')}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {categoryLabel(g)}
            </option>
          ))}
        </select>
      )}
      {count !== undefined && (
        <span className="text-xs text-muted tabular-nums">
          {t('assets.filter.count', { count })}
        </span>
      )}
    </div>
  )
}
