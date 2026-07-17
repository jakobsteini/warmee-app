import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { ProductVariant } from '../types/productVariant'

/** Varianten eines Artikels (alphabetisch). */
export async function listVariantsByProduct(
  productId: string,
): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Alle Varianten der Org (für die Zuweisung in „Bilder zuordnen"). */
export async function listAllVariants(): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .order('name')
  if (error) throw error
  return data ?? []
}

/**
 * Variante für einen Artikel anlegen. org_id kommt aus dem Profil; der
 * Unique-Index (product_id, lower(name)) verhindert Doubletten je Artikel.
 */
export async function createVariant(
  productId: string,
  name: string,
): Promise<ProductVariant> {
  const org_id = await getMyOrgId()
  const { data, error } = await supabase
    .from('product_variants')
    .insert({ org_id, product_id: productId, name: name.trim() })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Variante löschen. Schlägt fehl (ON DELETE RESTRICT), solange Bilder darauf
 * zeigen — der Aufrufer muss die Bilder vorher umhängen.
 */
export async function deleteVariant(id: string): Promise<void> {
  const { error } = await supabase.from('product_variants').delete().eq('id', id)
  if (error) throw error
}
