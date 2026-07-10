import { supabase } from './supabase'
import { getMyOrgId } from './org'
import {
  CROP_FORMAT_BY_ID,
  type Crop,
  type CropFormat,
  type CropFormatId,
} from '../types/crop'

const BUCKET = 'crops'

/** Alle vorhandenen Zuschnitte eines Assets laden. */
export async function listCrops(assetId: string): Promise<Crop[]> {
  const { data, error } = await supabase
    .from('crops')
    .select('*')
    .eq('asset_id', assetId)

  if (error) throw error
  return (data ?? []) as Crop[]
}

/** Öffentliche URL einer zugeschnittenen Datei (crops-Bucket ist public). */
export function cropPublicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Ganzzahlige Crop-Koordinaten (Pixel des Originals). */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Den ausgewählten Bereich als JPEG erzeugen.
 *
 * sRGB-Konvertierung (CLAUDE.md): Das Canvas arbeitet im Farbraum "srgb",
 * die Bitmap wurde beim Dekodieren nach sRGB umgerechnet. Die ausgegebene
 * JPEG trägt kein Adobe-RGB-Profil und wird von Browsern/Mail-Clients als
 * sRGB interpretiert – so stimmen die Farben.
 */
export async function renderCropBlob(
  bitmap: ImageBitmap,
  crop: CropRect,
  format: CropFormat,
): Promise<Blob> {
  const outW = format.outputWidth
  const outH =
    format.outputHeight ?? Math.max(1, Math.round((outW * crop.h) / crop.w))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.')

  // JPEG kennt keine Transparenz → weißer Hintergrund als Sicherheitsnetz.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outW, outH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  )
  if (!blob) throw new Error('JPEG konnte nicht erzeugt werden.')
  return blob
}

export interface SaveCropInput {
  assetId: string
  format: CropFormatId
  crop: CropRect
  blob: Blob
}

/**
 * Zuschnitt speichern: JPEG in den crops-Bucket legen und die Koordinaten
 * in der DB ablegen. Bei erneutem Zuschnitt desselben Formats wird Datei und
 * Datensatz überschrieben (Bucket-Upsert + unique(asset_id, format)).
 */
export async function saveCrop({
  assetId,
  format,
  crop,
  blob,
}: SaveCropInput): Promise<Crop> {
  const org_id = await getMyOrgId()
  const fmt = CROP_FORMAT_BY_ID[format]
  const path = `${org_id}/${assetId}/${fmt.slug}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('crops')
    .upsert(
      {
        asset_id: assetId,
        format,
        x: crop.x,
        y: crop.y,
        w: crop.w,
        h: crop.h,
        output_path: path,
        // Beim Überschreiben mitziehen → dient zugleich als Cache-Buster.
        created_at: new Date().toISOString(),
      },
      { onConflict: 'asset_id,format' },
    )
    .select()
    .single()

  if (error) throw error
  return data as Crop
}
