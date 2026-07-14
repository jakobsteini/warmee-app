import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type {
  Asset,
  AssetFileMeta,
  AssetType,
  AssetWithMeta,
  UploadOptions,
} from '../types/asset'

const BUCKET = 'assets'
/** Gültigkeit der Signed-URLs für die Anzeige (privater Bucket). */
const SIGNED_URL_TTL = 60 * 60 // 1 Stunde

export interface AssetFilters {
  asset_type?: AssetType | null
  season_id?: string | null
  /** true = nur zugeordnete, false = nur nicht zugeordnete, null/undef = alle. */
  assigned?: boolean | null
}

/** Pixelmaße einer Bilddatei im Browser auslesen. */
async function readImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  // createImageBitmap ist am schnellsten und dekodiert off-main-thread.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return size
    } catch {
      // Fallback unten
    }
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

/** Dateiendung aus dem Dateinamen (klein), Fallback 'jpg'. */
function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return 'jpg'
  return filename.slice(dot + 1).toLowerCase() || 'jpg'
}

/**
 * Assets der eigenen Org laden, optional gefiltert nach Typ und Saison.
 * Liefert die zugeordneten Händler-IDs sowie eine Signed-URL je Bild mit.
 */
export async function listAssets(
  filters: AssetFilters = {},
): Promise<AssetWithMeta[]> {
  let query = supabase
    .from('assets')
    .select('*, asset_dealers(dealer_id)')
    .order('created_at', { ascending: false })

  if (filters.asset_type) query = query.eq('asset_type', filters.asset_type)
  if (filters.season_id) query = query.eq('season_id', filters.season_id)
  if (filters.assigned === true) query = query.not('product_id', 'is', null)
  if (filters.assigned === false) query = query.is('product_id', null)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as (Asset & {
    asset_dealers: { dealer_id: string }[] | null
  })[]

  // Signed-URLs gebündelt erzeugen (privater Bucket).
  const paths = rows.map((r) => r.storage_path)
  const urlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL)
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl)
    }
  }

  return rows.map((r) => {
    const { asset_dealers, ...asset } = r
    return {
      ...asset,
      dealer_ids: (asset_dealers ?? []).map((d) => d.dealer_id),
      url: urlByPath.get(r.storage_path) ?? null,
    }
  })
}

/**
 * Eine JPEG-Datei hochladen: Pixelmaße auslesen, in den privaten Bucket
 * legen und den Asset-Datensatz anlegen. Bei einem Fehler nach dem Upload
 * wird die Datei wieder entfernt, damit keine verwaisten Objekte bleiben.
 */
export async function uploadAsset(
  file: File,
  opts: UploadOptions,
  meta?: AssetFileMeta,
): Promise<Asset> {
  const org_id = await getMyOrgId()
  const size = await readImageSize(file)

  const path = `${org_id}/${crypto.randomUUID()}.${extOf(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('assets')
    .insert({
      org_id,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || 'image/jpeg',
      file_size: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
      asset_kind: 'photo',
      asset_type: opts.asset_type,
      season_id: opts.season_id,
      status: 'done',
      // Aus dem Dateinamen vorbefüllte, im UI korrigierbare Metadaten.
      model: meta?.model ?? null,
      color_code: meta?.color_code ?? null,
      color_name: meta?.color_name ?? null,
      color_code_2: meta?.color_code_2 ?? null,
      color_name_2: meta?.color_name_2 ?? null,
      is_social_media: meta?.is_social_media ?? false,
    })
    .select()
    .single()

  if (error) {
    // Upload rückgängig machen, damit kein verwaistes Objekt zurückbleibt.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }

  return data
}

/** Typ und/oder Saison eines Assets ändern. */
export async function updateAsset(
  id: string,
  patch: { asset_type?: AssetType; season_id?: string | null },
): Promise<void> {
  const { error } = await supabase.from('assets').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Bild einem Artikel zuordnen (oder Zuordnung aufheben mit null).
 * Schreibt nur assets.product_id; org-Scoping/RLS greifen über die Policy.
 */
export async function setAssetProduct(
  assetId: string,
  productId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .update({ product_id: productId })
    .eq('id', assetId)
  if (error) throw error
}

/**
 * Bild als "bewusst kein Artikel" markieren (oder Markierung aufheben).
 * Schreibt nur assets.no_product_match; org-Scoping/RLS greifen über die Policy.
 */
export async function setAssetNoProductMatch(
  assetId: string,
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .update({ no_product_match: value })
    .eq('id', assetId)
  if (error) throw error
}

/** Asset löschen: erst die Datei aus dem Bucket, dann den DB-Datensatz. */
export async function deleteAsset(asset: Asset): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([asset.storage_path])
  if (storageError) throw storageError

  // asset_dealers hängt per ON DELETE CASCADE dran.
  const { error } = await supabase.from('assets').delete().eq('id', asset.id)
  if (error) throw error
}

/** Aktuell zugeordnete Händler-IDs eines Assets. */
export async function getAssetDealerIds(assetId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('asset_dealers')
    .select('dealer_id')
    .eq('asset_id', assetId)

  if (error) throw error
  return (data ?? []).map((d) => d.dealer_id)
}

/**
 * Händler-Zuordnung eines Assets komplett setzen (Mehrfachauswahl).
 * Bestehende Zuordnungen werden ersetzt.
 */
export async function setAssetDealers(
  assetId: string,
  dealerIds: string[],
): Promise<void> {
  const { error: delError } = await supabase
    .from('asset_dealers')
    .delete()
    .eq('asset_id', assetId)
  if (delError) throw delError

  if (dealerIds.length === 0) return

  const assigned_by = await getMyUserId()
  const rows = dealerIds.map((dealer_id) => ({
    asset_id: assetId,
    dealer_id,
    assigned_by,
  }))

  const { error } = await supabase.from('asset_dealers').insert(rows)
  if (error) throw error
}
