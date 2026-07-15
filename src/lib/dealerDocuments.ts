import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type {
  DealerDocument,
  DealerDocumentCategory,
} from '../types/dealerDocument'

const BUCKET = 'dealer-documents'
/** Gültigkeit der Signed-URLs für den Download (privater Bucket). */
const SIGNED_URL_TTL = 60 * 60 // 1 Stunde

/** Dateinamen für den Storage-Schlüssel entschärfen (Punkt für Endung bleibt). */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** Alle Dokumente eines Händlers (RLS org-scoped), neueste zuerst. */
export async function listDealerDocuments(
  dealerId: string,
): Promise<DealerDocument[]> {
  const { data, error } = await supabase
    .from('dealer_documents')
    .select('*')
    .eq('dealer_id', dealerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as DealerDocument[]
}

/** Anzahl Dokumente eines Händlers (für die Lösch-Sperre des Händlers). */
export async function countDealerDocuments(dealerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('dealer_documents')
    .select('id', { count: 'exact', head: true })
    .eq('dealer_id', dealerId)

  if (error) throw error
  return count ?? 0
}

/**
 * Dokument hochladen: Datei in den privaten Bucket legen (Pfad
 * <org_id>/<dealer_id>/<uuid>-<datei>), dann die Metadaten-Zeile anlegen.
 * Schlägt der DB-Insert fehl, wird die bereits hochgeladene Datei wieder
 * entfernt — keine verwaiste Datei ohne Eintrag.
 */
export async function uploadDealerDocument(
  dealerId: string,
  file: File,
  category: DealerDocumentCategory,
): Promise<DealerDocument> {
  const [org_id, created_by] = await Promise.all([getMyOrgId(), getMyUserId()])

  const path = `${org_id}/${dealerId}/${crypto.randomUUID()}-${safeName(file.name)}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('dealer_documents')
    .insert({
      org_id,
      dealer_id: dealerId,
      file_name: file.name,
      category,
      content_type: file.type || null,
      file_size: file.size,
      storage_path: path,
      created_by,
    })
    .select()
    .single()

  if (error) {
    // Datei ohne Metadaten-Zeile ist wertlos — wieder entfernen.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data as DealerDocument
}

/** Signierte Download-URL für ein Dokument (privater Bucket, 1 h gültig). */
export async function signedDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error || !data) throw error ?? new Error('URL konnte nicht erzeugt werden.')
  return data.signedUrl
}

/**
 * Dokument löschen: ERST die Datei aus dem Bucket, DANN die Metadaten-Zeile.
 * Schlägt das Datei-Löschen fehl, bleibt die Zeile stehen (keine unsichtbare
 * Karteileiche im Bucket).
 */
export async function deleteDealerDocument(doc: DealerDocument): Promise<void> {
  const { error: rmErr } = await supabase.storage
    .from(BUCKET)
    .remove([doc.storage_path])
  if (rmErr) throw rmErr

  const { error } = await supabase
    .from('dealer_documents')
    .delete()
    .eq('id', doc.id)
  if (error) throw error
}
