import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import {
  listAssets,
  uploadAsset,
  updateAsset,
  deleteAsset,
  getAssetDealerIds,
  setAssetDealers,
} from '../lib/assets'
import { metaFromFilename } from '../lib/assetFilename'
import { listSeasons } from '../lib/seasons'
import { listDealers } from '../lib/dealers'
import type { Dealer } from '../types/dealer'
import {
  ASSET_TYPES,
  type AssetFileMeta,
  type AssetType,
  type AssetWithMeta,
  type Season,
} from '../types/asset'
import EmptyState from '../components/EmptyState'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Asset-Typ → Übersetzungs-Key. */
function assetTypeKey(type: AssetType): TranslationKey {
  return `asset.type.${type}` as TranslationKey
}

/** Nur JPEGs werden angenommen (Regel: Bildmaterial immer JPEG). */
function isJpeg(file: File): boolean {
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    /\.jpe?g$/i.test(file.name)
  )
}

/** Eine zum Upload vorgemerkte Datei mit editierbaren, vorbefüllten Metadaten. */
interface StagedFile {
  id: string
  file: File
  meta: AssetFileMeta
  status: 'pending' | 'uploading' | 'done' | 'error'
}

export default function Assets() {
  const t = useT()
  const [assets, setAssets] = useState<AssetWithMeta[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter
  const [filterType, setFilterType] = useState<AssetType | null>(null)
  const [filterSeason, setFilterSeason] = useState<string | null>(null)

  // Upload-Auswahl (gilt für den nächsten Batch)
  const [uploadType, setUploadType] = useState<AssetType>('product')
  const [uploadSeason, setUploadSeason] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Detail-Modal
  const [selected, setSelected] = useState<AssetWithMeta | null>(null)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAssets(
        await listAssets({ asset_type: filterType, season_id: filterSeason }),
      )
    } catch {
      setError(t('assets.loadError'))
    } finally {
      setLoading(false)
    }
  }, [filterType, filterSeason])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  // Stammdaten (Saisons, Händler) einmalig laden.
  useEffect(() => {
    ;(async () => {
      try {
        const [s, d] = await Promise.all([listSeasons(), listDealers()])
        setSeasons(s)
        setDealers(d)
        const active = s.find((x) => x.is_active) ?? s[0]
        if (active) setUploadSeason(active.id)
      } catch {
        // Filter/Upload funktionieren zur Not auch ohne Stammdaten.
      }
    })()
  }, [])

  /**
   * Ausgewählte/gedroppte Dateien vormerken: JPEGs filtern, Metadaten aus dem
   * Dateinamen vorbefüllen und in die editierbare Staging-Liste legen.
   * Es wird noch NICHT hochgeladen – der Upload passiert erst per Button.
   */
  function stageFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const jpegs = files.filter(isJpeg)
    const skipped = files.length - jpegs.length

    if (jpegs.length === 0) {
      setError(skipped > 0 ? t('assets.onlyJpeg') : t('assets.noFiles'))
      return
    }

    setError(skipped > 0 ? t('assets.skipped', { count: skipped }) : null)

    setStaged((prev) => [
      ...prev,
      ...jpegs.map<StagedFile>((file) => ({
        id: crypto.randomUUID(),
        file,
        meta: metaFromFilename(file.name),
        status: 'pending',
      })),
    ])
  }

  function updateStagedMeta(id: string, patch: Partial<AssetFileMeta>) {
    setStaged((prev) =>
      prev.map((s) => (s.id === id ? { ...s, meta: { ...s.meta, ...patch } } : s)),
    )
  }

  function removeStaged(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id))
  }

  /**
   * Alle noch nicht hochgeladenen Dateien nacheinander hochladen – mit den
   * (ggf. korrigierten) Metadaten. Fehler pro Datei stoppen den Batch nicht;
   * erfolgreiche Dateien fallen danach aus der Liste, Fehler bleiben stehen.
   */
  async function uploadAll() {
    const pending = staged.filter((s) => s.status !== 'done')
    if (pending.length === 0) return

    setUploading(true)
    setError(null)

    for (const item of pending) {
      setStaged((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, status: 'uploading' } : s)),
      )
      try {
        await uploadAsset(
          item.file,
          { asset_type: uploadType, season_id: uploadSeason },
          item.meta,
        )
        setStaged((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, status: 'done' } : s)),
        )
      } catch {
        setStaged((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, status: 'error' } : s)),
        )
      }
    }

    setUploading(false)
    await loadAssets()
    // Erfolgreiche entfernen, Fehler zum erneuten Versuch stehen lassen.
    setStaged((prev) => prev.filter((s) => s.status !== 'done'))
  }

  async function handleDelete(asset: AssetWithMeta) {
    if (!window.confirm(t('assets.deleteConfirm', { filename: asset.filename })))
      return
    try {
      await deleteAsset(asset)
      setSelected(null)
      await loadAssets()
    } catch {
      setError(t('common.deleteFailed'))
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) stageFiles(e.dataTransfer.files)
  }

  const seasonLabel = useMemo(() => {
    const map = new Map(seasons.map((s) => [s.id, s.label]))
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—')
  }, [seasons])

  const pendingCount = staged.filter((s) => s.status !== 'done').length

  const selectClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">{t('assets.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('assets.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload-Zone */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('common.type')}
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as AssetType)}
              className={selectClass}
            >
              {ASSET_TYPES.map((at) => (
                <option key={at} value={at}>
                  {t(assetTypeKey(at))}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            {t('common.season')}
            <select
              value={uploadSeason ?? ''}
              onChange={(e) => setUploadSeason(e.target.value || null)}
              className={selectClass}
            >
              <option value="">{t('common.withoutSeason')}</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={[
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center transition-colors',
            dragOver
              ? 'border-ink bg-card'
              : 'border-line bg-surface hover:bg-card',
          ].join(' ')}
        >
          <p className="text-sm text-ink">{t('assets.dropzone')}</p>
          <p className="mt-1 text-xs text-muted">
            {t('assets.dropzoneHint', {
              type: t(assetTypeKey(uploadType)),
              season: uploadSeason ? seasonLabel(uploadSeason) : t('assets.seasonNone'),
            })}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) stageFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {/* Staging-Liste: vorbefüllte, editierbare Metadaten pro Datei */}
        {staged.length > 0 && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {t('assets.stagedCount', { count: staged.length })}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStaged([])}
                  disabled={uploading}
                  className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
                >
                  {t('assets.clearList')}
                </button>
                <button
                  type="button"
                  onClick={uploadAll}
                  disabled={uploading || pendingCount === 0}
                  className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {uploading
                    ? t('common.loading')
                    : t('assets.uploadN', { count: pendingCount })}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {staged.map((item) => (
                <StagedCard
                  key={item.id}
                  item={item}
                  disabled={uploading}
                  onChange={(patch) => updateStagedMeta(item.id, patch)}
                  onRemove={() => removeStaged(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterPill
            active={filterType === null}
            onClick={() => setFilterType(null)}
          >
            {t('common.all')}
          </FilterPill>
          {ASSET_TYPES.map((at) => (
            <FilterPill
              key={at}
              active={filterType === at}
              onClick={() => setFilterType(at)}
            >
              {t(assetTypeKey(at))}
            </FilterPill>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={filterSeason ?? ''}
            onChange={(e) => setFilterSeason(e.target.value || null)}
            className={selectClass}
          >
            <option value="">{t('common.allSeasons')}</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gallery */}
      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : assets.length === 0 ? (
        uploading ? (
          <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted">{t('assets.uploadRunning')}</p>
          </div>
        ) : filterType !== null || filterSeason !== null ? (
          <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted">{t('assets.noneInView')}</p>
          </div>
        ) : (
          <EmptyState
            actionLabel={t('assets.selectJpegs')}
            onAction={() => fileInput.current?.click()}
          >
            {t('assets.empty')}
          </EmptyState>
        )
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a)}
              className="group relative aspect-square overflow-hidden rounded-md border-[0.5px] border-line bg-card"
            >
              {a.url ? (
                <img
                  src={a.url}
                  alt={a.filename}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  {a.filename}
                </div>
              )}
              {a.dealer_ids.length > 0 && (
                <span className="absolute right-2 top-2 rounded-full bg-ink/85 px-2 py-0.5 text-[11px] text-cream">
                  {t('assets.dealerCount', { count: a.dealer_ids.length })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <AssetDetail
          asset={selected}
          dealers={dealers}
          seasons={seasons}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected)}
          onSaved={loadAssets}
        />
      )}
    </div>
  )
}

/** Editierbare Metadaten-Karte für eine vorgemerkte Upload-Datei. */
function StagedCard({
  item,
  disabled,
  onChange,
  onRemove,
}: {
  item: StagedFile
  disabled: boolean
  onChange: (patch: Partial<AssetFileMeta>) => void
  onRemove: () => void
}) {
  const t = useT()
  const { meta } = item
  const inputClass =
    'w-full rounded-md border-[0.5px] border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-60'
  const statusLabel =
    item.status === 'error'
      ? t('assets.staged.error')
      : item.status === 'done'
        ? t('assets.staged.done')
        : item.status === 'uploading'
          ? t('common.loading')
          : t('assets.staged.pending')

  return (
    <div className="rounded-md border-[0.5px] border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="truncate text-sm text-ink" title={item.file.name}>
          {item.file.name}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={
              item.status === 'error'
                ? 'text-xs text-red-700'
                : item.status === 'done'
                  ? 'text-xs text-ink'
                  : 'text-xs text-muted'
            }
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-sm text-muted transition-colors hover:text-red-700 disabled:opacity-50"
            aria-label={t('assets.removeFromList')}
          >
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs text-muted">{t('common.model')}</span>
          <input
            type="text"
            value={meta.model ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ model: e.target.value || null })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t('assets.staged.colorCode')}</span>
          <input
            type="text"
            value={meta.color_code ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ color_code: e.target.value || null })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t('common.color')}</span>
          <input
            type="text"
            value={meta.color_name ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ color_name: e.target.value || null })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t('assets.staged.colorCode2')}</span>
          <input
            type="text"
            value={meta.color_code_2 ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ color_code_2: e.target.value || null })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t('assets.staged.color2')}</span>
          <input
            type="text"
            value={meta.color_name_2 ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ color_name_2: e.target.value || null })}
            className={inputClass}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <input
            type="checkbox"
            checked={meta.is_social_media}
            disabled={disabled}
            onChange={(e) => onChange({ is_social_media: e.target.checked })}
            className="accent-ink"
          />
          <span className="text-xs text-muted">{t('assets.staged.socialMedia')}</span>
        </label>
      </div>
    </div>
  )
}

function FilterPill({
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

function AssetDetail({
  asset,
  dealers,
  seasons,
  onClose,
  onDelete,
  onSaved,
}: {
  asset: AssetWithMeta
  dealers: Dealer[]
  seasons: Season[]
  onClose: () => void
  onDelete: () => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const [assetType, setAssetType] = useState<AssetType>(asset.asset_type)
  const [seasonId, setSeasonId] = useState<string | null>(asset.season_id)
  const [selectedIds, setSelectedIds] = useState<string[]>(asset.dealer_ids)
  const [saving, setSaving] = useState(false)
  const [loadingDealers, setLoadingDealers] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Zugeordnete Händler frisch laden (Quelle der Wahrheit statt Cache).
  useEffect(() => {
    ;(async () => {
      try {
        setSelectedIds(await getAssetDealerIds(asset.id))
      } catch {
        setSelectedIds(asset.dealer_ids)
      } finally {
        setLoadingDealers(false)
      }
    })()
  }, [asset.id, asset.dealer_ids])

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      if (assetType !== asset.asset_type || seasonId !== asset.season_id) {
        await updateAsset(asset.id, {
          asset_type: assetType,
          season_id: seasonId,
        })
      }
      await setAssetDealers(asset.id, selectedIds)
      await onSaved()
      onClose()
    } catch {
      setSaveError(t('assets.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  // Farb-Zusammenfassung aus den (vorbefüllten) Metadaten.
  const colorSummary = [
    [asset.color_code, asset.color_name].filter(Boolean).join(' '),
    [asset.color_code_2, asset.color_name_2].filter(Boolean).join(' '),
  ]
    .filter((s) => s.length > 0)
    .join(', ')

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-cream shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hidden w-1/2 shrink-0 items-center justify-center bg-card p-4 sm:flex">
          {asset.url ? (
            <img
              src={asset.url}
              alt={asset.filename}
              className="max-h-[80vh] w-full object-contain"
            />
          ) : (
            <span className="text-sm text-muted">{t('assets.noPreview')}</span>
          )}
        </div>

        <div className="flex w-full flex-col overflow-y-auto p-6 sm:w-1/2">
          <h2 className="truncate text-lg font-medium text-ink">
            {asset.filename}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {t('assets.dimensions')}:{' '}
            <span className="text-ink">
              {asset.width && asset.height
                ? `${asset.width} × ${asset.height} px`
                : '—'}
            </span>
          </p>
          {(asset.model || colorSummary || asset.is_social_media) && (
            <p className="mt-1 text-sm text-muted">
              {asset.model && (
                <>
                  {t('common.model')}: <span className="text-ink">{asset.model}</span>
                  {(colorSummary || asset.is_social_media) && ' · '}
                </>
              )}
              {colorSummary && (
                <>
                  {t('common.color')}: <span className="text-ink">{colorSummary}</span>
                  {asset.is_social_media && ' · '}
                </>
              )}
              {asset.is_social_media && (
                <span className="text-ink">{t('assets.staged.socialMedia')}</span>
              )}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm text-muted">{t('common.type')}</span>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className={fieldClass}
              >
                {ASSET_TYPES.map((at) => (
                  <option key={at} value={at}>
                    {t(assetTypeKey(at))}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm text-muted">{t('common.season')}</span>
              <select
                value={seasonId ?? ''}
                onChange={(e) => setSeasonId(e.target.value || null)}
                className={fieldClass}
              >
                <option value="">{t('common.withoutSeason')}</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex-1">
            <p className="mb-2 text-sm font-medium text-ink">{t('assets.assignDealers')}</p>
            {loadingDealers ? (
              <p className="text-sm text-muted">{t('common.loading')}</p>
            ) : dealers.length === 0 ? (
              <p className="text-sm text-muted">{t('assets.noDealers')}</p>
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {dealers.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-card"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(d.id)}
                      onChange={() => toggle(d.id)}
                      className="accent-ink"
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {saveError && (
            <p className="mt-3 text-sm text-red-700">{saveError}</p>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-muted transition-colors hover:text-red-700"
            >
              {t('common.delete')}
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || loadingDealers}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
