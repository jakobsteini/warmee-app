import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { cropPublicUrl } from './crops'
import type {
  DealerImage,
  NewsletterDetail,
  NewsletterListItem,
  NewsletterStatus,
} from '../types/newsletter'

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
  body_headline: string | null
  body_text: string | null
  link_label: string | null
  link_url: string | null
  accent_color: string
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
    body_headline: input.body_headline,
    body_text: input.body_text,
    link_label: input.link_label,
    link_url: input.link_url,
    accent_color: input.accent_color,
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

/**
 * Alle Newsletter der eigenen Org für die Verlaufsliste (RLS scoped),
 * zuletzt geänderte zuerst. Der Händlername wird per Join mitgeladen.
 */
export async function listNewsletters(): Promise<NewsletterListItem[]> {
  const { data, error } = await supabase
    .from('newsletters')
    .select('id, title, status, updated_at, downloaded_at, dealers(name)')
    .order('updated_at', { ascending: false })

  if (error) throw error

  type Row = {
    id: string
    title: string
    status: NewsletterStatus
    updated_at: string | null
    downloaded_at: string | null
    // PostgREST liefert die many-to-one-Relation als Objekt; defensiv auch Array.
    dealers: { name: string } | { name: string }[] | null
  }

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    updated_at: row.updated_at,
    downloaded_at: row.downloaded_at,
    dealer_name: Array.isArray(row.dealers)
      ? (row.dealers[0]?.name ?? null)
      : (row.dealers?.name ?? null),
  }))
}

/**
 * Einen gespeicherten Newsletter vollständig laden, um ihn im Editor
 * wieder zu öffnen. Die Produkt-Slots kommen nach `position` sortiert zurück.
 */
export async function getNewsletterDetail(
  id: string,
): Promise<NewsletterDetail> {
  const { data, error } = await supabase
    .from('newsletters')
    .select(
      'id, title, subject_line, preheader, body_headline, body_text, link_label, link_url, accent_color, dealer_id, hero_asset_id, status, newsletter_products(asset_id, position)',
    )
    .eq('id', id)
    .single()

  if (error) throw error

  const products = (
    (data.newsletter_products ?? []) as {
      asset_id: string
      position: number
    }[]
  )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => p.asset_id)

  return {
    id: data.id,
    title: data.title,
    subject_line: data.subject_line,
    preheader: data.preheader,
    body_headline: data.body_headline,
    body_text: data.body_text,
    link_label: data.link_label,
    link_url: data.link_url,
    accent_color: data.accent_color ?? '#a08d79',
    dealer_id: data.dealer_id,
    hero_asset_id: data.hero_asset_id,
    status: data.status,
    product_asset_ids: products,
  }
}

/** Newsletter löschen (newsletter_products hängt per ON DELETE CASCADE dran). */
export async function deleteNewsletter(id: string): Promise<void> {
  const { error } = await supabase.from('newsletters').delete().eq('id', id)
  if (error) throw error
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
