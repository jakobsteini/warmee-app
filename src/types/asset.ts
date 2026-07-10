/** Bild-/Video-Typ (im Schema: asset_type). */
export type AssetType = 'product' | 'lifestyle' | 'campaign' | 'lookbook'

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
}

/**
 * Asset inklusive der zugeordneten Händler-IDs und einer temporären
 * Signed-URL für die Anzeige (der "assets"-Bucket ist privat).
 */
export interface AssetWithMeta extends Asset {
  dealer_ids: string[]
  url: string | null
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
}

/** Reihenfolge der asset_type-Werte für Filter und Upload-Auswahl. */
export const ASSET_TYPES: AssetType[] = [
  'product',
  'lifestyle',
  'campaign',
  'lookbook',
]
