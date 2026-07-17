import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { listAssets } from '../lib/assets'
import {
  cropPublicUrl,
  listCrops,
  renderCropBlob,
  saveCrop,
  type CropRect,
} from '../lib/crops'
import {
  CROP_FORMATS,
  CROP_FORMAT_BY_ID,
  type Crop,
  type CropFormatId,
} from '../types/crop'
import type { AssetWithMeta } from '../types/asset'
import AssetFilterBar from '../components/AssetFilterBar'
import { availableGroups, filterAssets } from '../lib/assetFilter'
import { useT } from '../i18n'

/** Wert auf [min, max] begrenzen. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export default function Crop() {
  const t = useT()
  const [assets, setAssets] = useState<AssetWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AssetWithMeta | null>(null)
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // Nur Fotos lassen sich zuschneiden (aktuell sind alle Assets Fotos).
        setAssets((await listAssets()).filter((a) => a.asset_kind === 'photo'))
      } catch {
        setError(t('assets.loadError'))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const groups = useMemo(() => availableGroups(assets), [assets])
  const visible = useMemo(
    () => filterAssets(assets, { search, group }),
    [assets, search, group],
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink">{t('crop.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('crop.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {selected ? (
        <Editor asset={selected} onBack={() => setSelected(null)} />
      ) : loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : assets.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted">{t('crop.noAssets')}</p>
        </div>
      ) : (
        <>
          {/* Suche + Produktgruppe — derselbe Baustein wie im Bildarchiv */}
          <div className="mb-6">
            <AssetFilterBar
              search={search}
              onSearchChange={setSearch}
              group={group}
              onGroupChange={setGroup}
              groups={groups}
              count={visible.length}
            />
          </div>
          {visible.length === 0 ? (
            <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-12 text-center">
              <p className="text-sm text-muted">{t('assets.noneInView')}</p>
            </div>
          ) : (
            <Picker assets={visible} onPick={setSelected} />
          )}
        </>
      )}
    </div>
  )
}

/** Bildauswahl aus dem Archiv (Kachel-Raster). */
function Picker({
  assets,
  onPick,
}: {
  assets: AssetWithMeta[]
  onPick: (a: AssetWithMeta) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {assets.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a)}
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
        </button>
      ))}
    </div>
  )
}

/** Der eigentliche Zuschnitt-Editor für ein gewähltes Bild. */
function Editor({
  asset,
  onBack,
}: {
  asset: AssetWithMeta
  onBack: () => void
}) {
  const t = useT()
  const imgRef = useRef<HTMLImageElement>(null)
  const cropperRef = useRef<Cropper | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [cropperReady, setCropperReady] = useState(false)
  const [format, setFormat] = useState<CropFormatId>('4:5')
  const [crops, setCrops] = useState<Crop[]>([])
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const cropByFormat = useMemo(() => {
    const map = new Map<CropFormatId, Crop>()
    for (const c of crops) map.set(c.format, c)
    return map
  }, [crops])

  const refreshCrops = useCallback(async () => {
    try {
      setCrops(await listCrops(asset.id))
    } catch {
      // Übersicht ist nicht kritisch für das Zuschneiden selbst.
    }
  }, [asset.id])

  // Original als Blob laden: Object-URL fürs Cropper-<img>, ImageBitmap für
  // den späteren Export (ein einziger Fetch, kein Canvas-Tainting).
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setLoadError(null)
    setBlobUrl(null)
    ;(async () => {
      if (!asset.url) {
        setLoadError(t('crop.noSource'))
        return
      }
      try {
        const res = await fetch(asset.url)
        if (!res.ok) throw new Error('fetch failed')
        const blob = await res.blob()
        const bitmap = await createImageBitmap(blob, {
          colorSpaceConversion: 'default',
        })
        if (cancelled) {
          bitmap.close()
          return
        }
        bitmapRef.current = bitmap
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      } catch {
        if (!cancelled) setLoadError(t('crop.originalError'))
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [asset.url])

  useEffect(() => {
    refreshCrops()
  }, [refreshCrops])

  // Cropper aufbauen, sobald das Bild als Object-URL bereitsteht.
  useEffect(() => {
    const img = imgRef.current
    if (!img || !blobUrl) return
    setCropperReady(false)

    const cropper = new Cropper(img, {
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      background: false,
      responsive: true,
      // Startverhältnis; Wechsel passiert im separaten Format-Effekt.
      aspectRatio: CROP_FORMAT_BY_ID[format].aspectRatio ?? NaN,
      ready: () => setCropperReady(true),
    })
    cropperRef.current = cropper

    return () => {
      cropper.destroy()
      cropperRef.current = null
      setCropperReady(false)
    }
    // Bewusst nur an blobUrl gebunden – das Seitenverhältnis wird separat
    // gesetzt, damit ein Formatwechsel den Cropper nicht neu aufbaut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl])

  // Formatwechsel: Seitenverhältnis setzen und – falls vorhanden – den
  // gespeicherten Rahmen dieses Formats wiederherstellen.
  useEffect(() => {
    const cropper = cropperRef.current
    if (!cropper || !cropperReady) return
    const fmt = CROP_FORMAT_BY_ID[format]
    cropper.setAspectRatio(fmt.aspectRatio ?? NaN)
    const existing = cropByFormat.get(format)
    if (existing) {
      cropper.setData({
        x: existing.x,
        y: existing.y,
        width: existing.w,
        height: existing.h,
      })
    }
  }, [cropperReady, format, cropByFormat])

  async function handleSave() {
    const cropper = cropperRef.current
    const bitmap = bitmapRef.current
    if (!cropper || !bitmap) return

    setSaving(true)
    setSaveError(null)
    try {
      const data = cropper.getData(true)
      // Auf gültige Pixelgrenzen des Originals begrenzen und ganzzahlig machen.
      const x = clamp(data.x, 0, bitmap.width - 1)
      const y = clamp(data.y, 0, bitmap.height - 1)
      const crop: CropRect = {
        x,
        y,
        w: clamp(data.width, 1, bitmap.width - x),
        h: clamp(data.height, 1, bitmap.height - y),
      }

      const fmt = CROP_FORMAT_BY_ID[format]
      const blob = await renderCropBlob(bitmap, crop, fmt)
      await saveCrop({ assetId: asset.id, format, crop, blob })
      await refreshCrops()
    } catch {
      setSaveError(t('crop.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const doneCount = crops.length

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border-[0.5px] border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-card"
        >
          {t('crop.otherImage')}
        </button>
        <span className="truncate text-sm text-muted">{asset.filename}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Cropper */}
        <div className="rounded-lg border-[0.5px] border-line bg-card p-2">
          {loadError ? (
            <div className="flex h-96 items-center justify-center text-sm text-red-700">
              {loadError}
            </div>
          ) : !blobUrl ? (
            <div className="flex h-96 items-center justify-center text-sm text-muted">
              {t('crop.imageLoading')}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-hidden">
              {/* Cropper ersetzt dieses <img> durch seine eigene Ansicht. */}
              <img
                ref={imgRef}
                src={blobUrl}
                alt={asset.filename}
                className="block max-w-full"
              />
            </div>
          )}
        </div>

        {/* Steuerung */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t('crop.format')}</p>
            <div className="flex flex-wrap gap-2">
              {CROP_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={[
                    'rounded-full px-4 py-1.5 text-sm transition-colors',
                    format === f.id
                      ? 'bg-ink text-cream'
                      : 'border-[0.5px] border-line text-ink hover:bg-card',
                  ].join(' ')}
                >
                  {f.label}
                  {cropByFormat.has(f.id) && (
                    <span
                      className={
                        format === f.id ? 'ml-1.5 text-cream' : 'ml-1.5 text-muted'
                      }
                    >
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {t('crop.outputHint', {
                width: CROP_FORMAT_BY_ID[format].outputWidth,
                heightSuffix: CROP_FORMAT_BY_ID[format].outputHeight
                  ? t('crop.heightSuffix', {
                      height: CROP_FORMAT_BY_ID[format].outputHeight ?? '',
                    })
                  : '',
              })}
            </p>
          </div>

          {saveError && <p className="text-sm text-red-700">{saveError}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !cropperReady}
            className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving
              ? t('common.saving')
              : cropByFormat.has(format)
                ? t('crop.updateCrop')
                : t('crop.saveCrop')}
          </button>

          {/* Übersicht: welche Formate schon zugeschnitten sind */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              {t('crop.doneCount', { done: doneCount, total: CROP_FORMATS.length })}
            </p>
            <div className="flex flex-col gap-2">
              {CROP_FORMATS.map((f) => {
                const crop = cropByFormat.get(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    className={[
                      'flex items-center gap-3 rounded-md border-[0.5px] px-3 py-2 text-left transition-colors',
                      format === f.id
                        ? 'border-ink bg-card'
                        : 'border-line hover:bg-card',
                    ].join(' ')}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-card">
                      {crop?.output_path ? (
                        <img
                          src={`${cropPublicUrl(crop.output_path)}?v=${encodeURIComponent(crop.created_at ?? '')}`}
                          alt={f.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted">—</span>
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm text-ink">{f.label}</span>
                      <span className="text-xs text-muted">
                        {crop ? t('crop.cropped') : t('crop.openState')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
