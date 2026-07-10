import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { cropPublicUrl } from './crops'
import type { DealerImage, NewsletterStatus } from '../types/newsletter'

/**
 * Alle für den Newsletter verwendbaren Bilder eines Händlers laden.
 *
 * Es werden nur Assets zurückgegeben, die diesem Händler zugeordnet sind
 * (asset_dealers) UND einen Newsletter-Zuschnitt besitzen – nur diese liegen
 * öffentlich im crops-Bucket und lassen sich in das HTML einbetten. Beide
 * Bedingungen sind über `!inner`-Joins als Pflicht formuliert.
 */
export async function listDealerNewsletterImages(
  dealerId: string,
): Promise<DealerImage[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(
      'id, filename, season_id, product_id, asset_dealers!inner(dealer_id), crops!inner(format, output_path)',
    )
    .eq('asset_dealers.dealer_id', dealerId)
    .eq('crops.format', 'newsletter')
    .order('created_at', { ascending: false })

  if (error) throw error

  type Row = {
    id: string
    filename: string
    season_id: string | null
    product_id: string | null
    crops: { format: string; output_path: string | null }[]
  }

  return ((data ?? []) as Row[]).flatMap((row) => {
    const crop = row.crops.find(
      (c) => c.format === 'newsletter' && c.output_path,
    )
    if (!crop?.output_path) return []
    return [
      {
        asset_id: row.id,
        filename: row.filename,
        season_id: row.season_id,
        product_id: row.product_id,
        cropUrl: cropPublicUrl(crop.output_path),
      },
    ]
  })
}

export interface SaveNewsletterInput {
  /** Vorhandene Newsletter-ID beim Aktualisieren; leer beim Neuanlegen. */
  id?: string | null
  title: string
  subject_line: string | null
  preheader: string | null
  dealer_id: string
  season_id: string | null
  hero_asset_id: string
  /** Genau zwei Produkt-Assets in Anzeigereihenfolge. */
  products: { asset_id: string; product_id: string | null }[]
  status: NewsletterStatus
}

/**
 * Newsletter anlegen oder aktualisieren (inkl. der beiden Produktbild-Slots).
 *
 * Die Produkt-Zuordnung wird beim Speichern komplett neu gesetzt
 * (löschen + einfügen), damit Reihenfolge und Auswahl immer dem aktuellen
 * Stand entsprechen. Gibt die Newsletter-ID zurück.
 */
export async function saveNewsletter(
  input: SaveNewsletterInput,
): Promise<string> {
  const org_id = await getMyOrgId()

  const fields = {
    org_id,
    title: input.title,
    subject_line: input.subject_line,
    preheader: input.preheader,
    dealer_id: input.dealer_id,
    season_id: input.season_id,
    hero_asset_id: input.hero_asset_id,
    status: input.status,
    updated_at: new Date().toISOString(),
  }

  let newsletterId = input.id ?? null

  if (newsletterId) {
    const { error } = await supabase
      .from('newsletters')
      .update(fields)
      .eq('id', newsletterId)
    if (error) throw error
  } else {
    const created_by = await getMyUserId()
    const { data, error } = await supabase
      .from('newsletters')
      .insert({ ...fields, created_by })
      .select('id')
      .single()
    if (error) throw error
    newsletterId = data.id as string
  }

  // Produkt-Slots vollständig ersetzen.
  const { error: delError } = await supabase
    .from('newsletter_products')
    .delete()
    .eq('newsletter_id', newsletterId)
  if (delError) throw delError

  const rows = input.products.map((p, index) => ({
    newsletter_id: newsletterId,
    asset_id: p.asset_id,
    product_id: p.product_id,
    position: index,
  }))
  const { error: insError } = await supabase
    .from('newsletter_products')
    .insert(rows)
  if (insError) throw insError

  return newsletterId
}

/** Newsletter nach dem HTML-Download als „downloaded" markieren. */
export async function markNewsletterDownloaded(id: string): Promise<void> {
  const { error } = await supabase
    .from('newsletters')
    .update({
      status: 'downloaded',
      downloaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}
