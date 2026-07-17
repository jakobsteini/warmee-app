import type { AssetVariantRef } from './productVariant'

/** Bild-/Video-Typ (im Schema: asset_type). */
export type AssetType =
  | 'product'
  | 'lifestyle'
  | 'campaign'
  | 'lookbook'
  | 'swatch'

/** Foto oder Video (im Schema: asset_kind). Aktuell nur Foto. */
export type AssetKind = 'photo' | 'video'

/** Upload-/Verarbeitungsstatus eines Assets. */
export type AssetStatus = 'uploading' | 'processing' | 'done' | 'error'

/** Ein Saison-Datensatz, wie ihn Supabase liefert. */
export interface Season {
  id: string
  org_id: string
  code: string
  label: string
  is_active: boolean | null
  created_at: string | null
}

/** Ein Asset-Datensatz (snake_case wie in der DB). */
export interface Asset {
  id: string
  org_id: string
  filename: string
  storage_path: string
  mime_type: string
  file_size: number | null
  width: number | null
  height: number | null
  asset_kind: AssetKind
  asset_type: AssetType
  product_id: string | null
  season_id: string | null
  status: AssetStatus
  created_at: string | null

  // ─── Aus dem Dateinamen abgeleitet (Parser: assetFilename.ts) ─────────────
  /** Modellname, z. B. "EmyShaded". Null, wenn nur Farbe im Namen steht. */
  model: string | null
  /** Haupt-Farbcode, z. B. "530". */
  color_code: string | null
  /** Haupt-Farbname, z. B. "olivine". */
  color_name: string | null
  /** Optionaler Zweit-Farbcode, z. B. "531". */
  color_code_2: string | null
  /** Optionaler Zweit-Farbname, z. B. "mayfly". */
  color_name_2: string | null
  /** True bei einer "_SocialMedia"-Variante des Bildes. */
  is_social_media: boolean

  /** Bewusst KEINEM Artikel zugeordnet (z. B. reines Farbmuster) → erledigt. */
  no_product_match: boolean

  /** Optionale Variante des Grundartikels (assets.variant_id). Null = Artikelbild. */
  variant_id: string | null
}

/**
 * Editierbare, pro Datei individuelle Metadaten für den Upload. Wird aus dem
 * Dateinamen vorbefüllt (metaFromFilename) und kann vor dem Speichern im UI
 * korrigiert werden.
 */
export interface AssetFileMeta {
  model: string | null
  color_code: string | null
  color_name: string | null
  color_code_2: string | null
  color_name_2: string | null
  is_social_media: boolean
}

/**
 * Kompaktverweis auf den verknüpften Artikel (über assets.product_id).
 * Trägt die Produktgruppe (`category`) für Filter und den Namen/Style für die
 * Suche — ohne den ganzen Product-Datensatz mitzuschleppen.
 */
export interface AssetProductRef {
  id: string
  name: string
  style: string | null
  category: string | null
}

/**
 * Asset inklusive der zugeordneten Händler-IDs, einer temporären Signed-URL für
 * die Anzeige (der "assets"-Bucket ist privat) und dem verknüpften Artikel
 * (null, wenn dem Bild kein Artikel zugeordnet ist).
 */
export interface AssetWithMeta extends Asset {
  dealer_ids: string[]
  url: string | null
  product: AssetProductRef | null
  /** Zugeordnete Variante (assets.variant_id → product_variants), oder null. */
  variant: AssetVariantRef | null
}

/** Auswahl beim Hochladen (gilt für den gesamten Batch). */
export interface UploadOptions {
  asset_type: AssetType
  season_id: string | null
}

/** Deutsche UI-Labels für die asset_type-Werte. */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  product: 'Produkt',
  lifestyle: 'Lifestyle',
  campaign: 'Kampagne',
  lookbook: 'Lookbook',
  swatch: 'Farbmuster',
}

/** Reihenfolge der asset_type-Werte für Filter und Upload-Auswahl. */
export const ASSET_TYPES: AssetType[] = [
  'product',
  'lifestyle',
  'campaign',
  'lookbook',
  'swatch',
]
