/** Zuschnitt-Format (im Schema: crops.format). */
export type CropFormatId = '4:5' | '3:4' | '9:16' | 'newsletter'

/** Ein Crop-Datensatz (snake_case wie in der DB). */
export interface Crop {
  id: string
  asset_id: string
  format: CropFormatId
  /** Crop-Koordinaten in Pixeln des Originalbilds. */
  x: number
  y: number
  w: number
  h: number
  /** Pfad der zugeschnittenen JPEG im "crops"-Bucket. */
  output_path: string | null
  created_at: string | null
}

/** Definition eines Zuschnitt-Formats inkl. Ziel-Ausgabegröße. */
export interface CropFormat {
  id: CropFormatId
  /** Deutsches UI-Label. */
  label: string
  /** Seitenverhältnis Breite/Höhe für den Cropper; null = frei (Newsletter). */
  aspectRatio: number | null
  /** Zielbreite der ausgegebenen JPEG in Pixeln. */
  outputWidth: number
  /** Zielhöhe; null = aus dem Crop-Verhältnis ableiten (Newsletter). */
  outputHeight: number | null
  /** Dateiname-Slug im crops-Bucket (":" ist als Storage-Key unschön). */
  slug: string
}

/**
 * Die vier Zuschnitt-Formate (CLAUDE.md → Bildmaterial).
 * Die Zielgrößen sind gängige Ausgabemaße; das Original wird nur
 * herunterskaliert, nie hochskaliert wirkt hier nur als Zielrahmen.
 */
export const CROP_FORMATS: CropFormat[] = [
  {
    id: '4:5',
    label: '4:5',
    aspectRatio: 4 / 5,
    outputWidth: 1080,
    outputHeight: 1350,
    slug: '4x5',
  },
  {
    id: '3:4',
    label: '3:4',
    aspectRatio: 3 / 4,
    outputWidth: 1080,
    outputHeight: 1440,
    slug: '3x4',
  },
  {
    id: '9:16',
    label: '9:16',
    aspectRatio: 9 / 16,
    outputWidth: 1080,
    outputHeight: 1920,
    slug: '9x16',
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    // Newsletter ist über die Breite (600px) definiert, nicht über ein festes
    // Verhältnis → freier Rahmen, Höhe ergibt sich aus dem Zuschnitt.
    aspectRatio: null,
    outputWidth: 600,
    outputHeight: null,
    slug: 'newsletter',
  },
]

export const CROP_FORMAT_BY_ID: Record<CropFormatId, CropFormat> =
  Object.fromEntries(CROP_FORMATS.map((f) => [f.id, f])) as Record<
    CropFormatId,
    CropFormat
  >
