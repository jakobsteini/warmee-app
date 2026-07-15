/**
 * Dokumentenablage je Händler (eigene Tabelle dealer_documents + privater
 * Storage-Bucket dealer-documents). Verträge/Vereinbarungen sind vertrauliche
 * Kundendokumente — Auslieferung ausschließlich über Signed URLs.
 *
 * Die Kategorie wird BEWUSST app-seitig als Union geführt (kein DB-CHECK), damit
 * eine spätere Kategorie eine reine Code-Änderung bleibt (siehe Migration).
 */
export type DealerDocumentCategory = 'contract' | 'agreement' | 'other'

/** Reihenfolge der Kategorien für Auswahl/Anzeige. */
export const DEALER_DOCUMENT_CATEGORIES: DealerDocumentCategory[] = [
  'contract',
  'agreement',
  'other',
]

/** Ein dealer_documents-Datensatz (snake_case wie in der DB). */
export interface DealerDocument {
  id: string
  org_id: string
  dealer_id: string
  /** Original-Dateiname (Anzeige). */
  file_name: string
  category: DealerDocumentCategory
  /** MIME-Typ, falls bekannt. */
  content_type: string | null
  /** Dateigröße in Bytes, falls bekannt. */
  file_size: number | null
  /** Pfad im Bucket (<org_id>/<dealer_id>/<uuid>-<datei>). */
  storage_path: string
  created_by: string | null
  created_at: string | null
}
