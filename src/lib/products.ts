import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { Product, ProductInput } from '../types/product'

/**
 * Alle Produkte der eigenen Org (RLS scoped automatisch), alphabetisch.
 * Gefiltert wird clientseitig – der Katalog ist klein (~80 Artikel) und so
 * bleiben die Filter-Pills (Saison/Kategorie) sofort und ohne Nachladen.
 */
export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/** Neues Produkt anlegen. org_id wird aus dem Profil ergänzt. */
export async function createProduct(input: ProductInput): Promise<Product> {
  const org_id = await getMyOrgId()

  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, org_id })
    .select()
    .single()

  if (error) throw error
  return data
}

/** Vorhandenes Produkt aktualisieren. */
export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Produkt löschen. Kann fehlschlagen, wenn noch Bilder oder Newsletter das
 * Produkt referenzieren (Foreign-Key-Restriktion) – die aufrufende Seite
 * fängt das ab und zeigt einen verständlichen Hinweis.
 */
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}
