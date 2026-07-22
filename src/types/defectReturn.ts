/** Eine dokumentierte Mangel-Retoure an den Lieferanten (snake_case wie DB). */
export interface DefectReturn {
  id: string
  org_id: string
  product_id: string | null
  article_text: string | null
  color: string | null
  size: string | null
  quantity: number
  producer_id: string | null
  /** Bezug zu Rechnung/LS (Freitext, z. B. Belegnummer). */
  beleg_bezug: string | null
  /** EK Nepal (Einkaufswert), numeric(10,2). */
  value_ek: number | string | null
  /** VK-Preis (Verkaufswert), numeric(10,2). */
  value_vk: number | string | null
  defect_note: string | null
  created_by: string | null
  created_at: string | null
}

/** Mangel-Retoure inkl. mitgeladenem Produkt-/Lieferantennamen (Liste). */
export interface DefectReturnWithRefs extends DefectReturn {
  product: { name: string } | null
  producer: { name: string } | null
}

/** Eingaben zum Erfassen einer Mangel-Retoure. */
export interface CreateDefectReturnInput {
  product_id: string | null
  article_text: string | null
  color: string | null
  size: string | null
  quantity: number
  producer_id: string | null
  beleg_bezug: string | null
  value_ek: number | null
  value_vk: number | null
  defect_note: string | null
}
