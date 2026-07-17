/** Eine Variante eines Grundartikels (z. B. „shaded"). Gehört zu genau einem
 *  Artikel (product_id); ein Artikel kann mehrere haben. */
export interface ProductVariant {
  id: string
  org_id: string
  product_id: string
  name: string
  created_at: string | null
}

/** Kompaktverweis auf die einem Bild zugeordnete Variante (assets.variant_id). */
export interface AssetVariantRef {
  id: string
  name: string
}
