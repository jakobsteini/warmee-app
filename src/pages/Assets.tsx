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
import { listSeasons } from '../lib/seasons'
import { listDealers } from '../lib/dealers'
import type { Dealer } from '../types/dealer'
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  type AssetType,
  type AssetWithMeta,
  type Season,
} from '../types/asset'
import EmptyState from '../components/EmptyState'

/** Nur JPEGs werden angenommen (Regel: Bildmaterial immer JPEG). */
function isJpeg(file: File): boolean {
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    /\.jpe?g$/i.test(file.name)
  )
}

interface UploadItem {
  name: string
  status: 'pending' | 'done' | 'error'
}

export default function Assets() {
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
  const [uploads, setUploads] = useState<UploadItem[]>([])
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
      setError('Bilder konnten nicht geladen werden.')
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

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const jpegs = files.filter(isJpeg)
    const skipped = files.length - jpegs.length

    if (jpegs.length === 0) {
      setError(
        skipped > 0
          ? 'Nur JPEG-Dateien werden unterstützt.'
          : 'Keine Dateien ausgewählt.',
      )
      return
    }

    setError(
      skipped > 0
        ? `${skipped} Datei(en) übersprungen – nur JPEG wird unterstützt.`
        : null,
    )
    setUploading(true)
    setUploads(jpegs.map((f) => ({ name: f.name, status: 'pending' })))

    for (let i = 0; i < jpegs.length; i++) {
      try {
        await uploadAsset(jpegs[i], {
          asset_type: uploadType,
          season_id: uploadSeason,
        })
        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: 'done' } : u)),
        )
      } catch {
        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: 'error' } : u)),
        )
      }
    }

    setUploading(false)
    await loadAssets()
    // Erfolgsmeldungen nach kurzer Zeit ausblenden.
    setTimeout(() => setUploads([]), 2500)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  async function handleDelete(asset: AssetWithMeta) {
    if (!window.confirm(`Bild „${asset.filename}" wirklich löschen?`)) return
    try {
      await deleteAsset(asset)
      setSelected(null)
      await loadAssets()
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }

  const seasonLabel = useMemo(() => {
    const map = new Map(seasons.map((s) => [s.id, s.label]))
    return (id: string | null) => (id ? (map.get(id) ?? '—') : '—')
  }, [seasons])

  const selectClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">Bildarchiv</h1>
        <p className="mt-1 text-sm text-muted">
          JPEGs hochladen, filtern und Händlern zuordnen.
        </p>
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
            Typ
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as AssetType)}
              className={selectClass}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Saison
            <select
              value={uploadSeason ?? ''}
              onChange={(e) => setUploadSeason(e.target.value || null)}
              className={selectClass}
            >
              <option value="">Ohne Saison</option>
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
          <p className="text-sm text-ink">
            JPEGs hierher ziehen oder klicken zum Auswählen
          </p>
          <p className="mt-1 text-xs text-muted">
            Neue Bilder erhalten Typ „{ASSET_TYPE_LABELS[uploadType]}" und Saison
            „{uploadSeason ? seasonLabel(uploadSeason) : 'ohne'}".
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {uploads.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {uploads.map((u, i) => (
              <div
                key={`${u.name}-${i}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate text-muted">{u.name}</span>
                <span
                  className={
                    u.status === 'error'
                      ? 'text-red-700'
                      : u.status === 'done'
                        ? 'text-ink'
                        : 'text-muted'
                  }
                >
                  {u.status === 'error'
                    ? 'Fehler'
                    : u.status === 'done'
                      ? 'Fertig'
                      : 'Lädt…'}
                </span>
              </div>
            ))}
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
            Alle
          </FilterPill>
          {ASSET_TYPES.map((t) => (
            <FilterPill
              key={t}
              active={filterType === t}
              onClick={() => setFilterType(t)}
            >
              {ASSET_TYPE_LABELS[t]}
            </FilterPill>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={filterSeason ?? ''}
            onChange={(e) => setFilterSeason(e.target.value || null)}
            className={selectClass}
          >
            <option value="">Alle Saisons</option>
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
        <p className="text-sm text-muted">Lädt…</p>
      ) : assets.length === 0 ? (
        uploading ? (
          <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted">Upload läuft…</p>
          </div>
        ) : filterType !== null || filterSeason !== null ? (
          <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted">Keine Bilder in dieser Ansicht.</p>
          </div>
        ) : (
          <EmptyState
            actionLabel="JPEGs auswählen"
            onAction={() => fileInput.current?.click()}
          >
            Hier lädst du dein Bildmaterial hoch und ordnest es Kollektion,
            Saison und Händlern zu. Lade die ersten JPEGs hoch.
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
                  {a.dealer_ids.length} Händler
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
      setSaveError('Änderungen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

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
            <span className="text-sm text-muted">Keine Vorschau</span>
          )}
        </div>

        <div className="flex w-full flex-col overflow-y-auto p-6 sm:w-1/2">
          <h2 className="truncate text-lg font-medium text-ink">
            {asset.filename}
          </h2>
          <p className="mt-3 text-sm text-muted">
            Maße:{' '}
            <span className="text-ink">
              {asset.width && asset.height
                ? `${asset.width} × ${asset.height} px`
                : '—'}
            </span>
          </p>

          <div className="mt-4 flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm text-muted">Typ</span>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className={fieldClass}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm text-muted">Saison</span>
              <select
                value={seasonId ?? ''}
                onChange={(e) => setSeasonId(e.target.value || null)}
                className={fieldClass}
              >
                <option value="">Ohne Saison</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex-1">
            <p className="mb-2 text-sm font-medium text-ink">Händler zuordnen</p>
            {loadingDealers ? (
              <p className="text-sm text-muted">Lädt…</p>
            ) : dealers.length === 0 ? (
              <p className="text-sm text-muted">
                Noch keine Händler angelegt.
              </p>
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
              Löschen
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || loadingDealers}
                className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
