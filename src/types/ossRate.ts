/** Ein OSS-Steuersatz je EU-Land (oss_country_rates). Nur für B2C. */
export interface OssCountryRate {
  id: string
  org_id: string
  /** ISO2-Land, z. B. 'DE'. */
  country_iso2: string
  country_name: string
  /** USt-Satz als FAKTOR (0.19 = 19 %); numeric kann als String ankommen. */
  vat_rate: number | string
  active: boolean
  created_at: string | null
  updated_at: string | null
}

/** Felder zum Anlegen eines OSS-Satzes (org_id kommt aus dem Profil). */
export interface OssCountryRateInput {
  country_iso2: string
  country_name: string
  /** FAKTOR (0.19). Das UI nimmt Prozent entgegen und teilt durch 100. */
  vat_rate: number
  active: boolean
}
