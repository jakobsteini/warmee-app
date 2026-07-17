import { ASSET_TYPES, type AssetType } from '../types/asset'
import { categoryLabel } from '../types/product'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Asset-Typ → Übersetzungs-Key. */
function assetTypeKey(type: AssetType): TranslationKey {
  return `asset.type.${type}` as TranslationKey
}

/**
 * Gemeinsame Such-/Filter-Leiste für Bildarchiv und Zuschnitt. Primäre Achse
 * ist der Bild-Typ (Pills); darunter Suchfeld + Produktgruppen-Select. Die
 * Gruppe ist eine Feinung *innerhalb* der Produktfotos und wird nur gezeigt,
 * wenn der Typ „Produktfoto" ist. Ein Baustein, in beiden Seiten genutzt.
 */
export default function AssetFilterBar({
  type,
  onTypeChange,
  search,
  onSearchChange,
  group,
  onGroupChange,
  groups,
  count,
}: {
  type: AssetType | null
  onTypeChange: (v: AssetType | null) => void
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
  const showGroup = type === 'product' && groups.length > 0

  return (
    <div className="flex flex-col gap-3">
      {/* Primäre Achse: Bild-Typ */}
      <div className="flex flex-wrap gap-2">
        <Pill active={type === null} onClick={() => onTypeChange(null)}>
          {t('common.all')}
        </Pill>
        {ASSET_TYPES.map((at) => (
          <Pill key={at} active={type === at} onClick={() => onTypeChange(at)}>
            {t(assetTypeKey(at))}
          </Pill>
        ))}
      </div>

      {/* Suche (immer) + Gruppe (nur bei Produktfoto) + Zähler */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('assets.search.placeholder')}
          className={`min-w-[16rem] flex-1 ${controlClass}`}
        />
        {showGroup && (
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
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-4 py-1.5 text-sm transition-colors',
        active
          ? 'bg-ink text-cream'
          : 'border-[0.5px] border-line text-ink hover:bg-card',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
