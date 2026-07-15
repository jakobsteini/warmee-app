/** Kundengruppe: B2B (Fachhandel) oder B2C (Endkunde). */
export type CustomerGroup = 'b2b' | 'b2c'

/** Ein Händler-Datensatz, wie ihn Supabase liefert (snake_case). */
export interface Dealer {
  id: string
  org_id: string
  name: string
  contact_name: string | null
  email: string | null
  city: string | null
  country: string | null
  agent_id: string | null
  created_at: string | null
  updated_at: string | null

  // ─── CRM-Erweiterung (Provision / Versand / Mahnwesen) ───────────────────
  /** Kundengruppe, NOT NULL DEFAULT 'b2b' in der DB. */
  customer_group: CustomerGroup
  /** Individueller Rabatt in % (Vorschlagswert für die Ordererfassung).
   *  NOT NULL DEFAULT 0; kommt als number oder numeric-String an. */
  discount_percent: number | string
  /** Kreditlimit in EUR; null = kein Limit hinterlegt. numeric(10,2). */
  credit_limit: number | string | null

  // ─── Echtdaten-Felder (FW26-Import), alle nullable ───────────────────────
  /** Kundennummer. Import-Kunden behalten ihre echte Nummer; neue Händler
   *  bekommen per DB-Sequence eine ab 92836. */
  kundennummer: number | null
  short_name: string | null
  company_name: string | null
  owner_name: string | null
  /** Umsatzsteuer-Identifikationsnummer, z. B. "ATU61622989". */
  uid: string | null
  gegenkonto: number | null

  /** Original-Zahlungskondition wie geliefert, z. B. "4,00%10T N30T". */
  payment_terms_raw: string | null
  /** Strukturierte Konditionen — werden erst in Schritt 3 (Geld-Logik) befüllt. */
  skonto_prozent: number | string | null
  skonto_tage: number | null
  zahlungsziel_tage: number | null

  // Lieferadresse (Excel: LS-*)
  shipping_street: string | null
  shipping_zip: string | null
  shipping_city: string | null
  shipping_country_code: string | null
  shipping_country_name: string | null
  shipping_phone: string | null
  shipping_email: string | null
  shipping_email2: string | null

  // Rechnungsadresse (Excel: Re-*)
  billing_name: string | null
  billing_street: string | null
  billing_zip: string | null
  billing_city: string | null
  billing_country_code: string | null
  billing_country_name: string | null
  billing_phone: string | null
  billing_email: string | null

  // Store-/POS-Adresse (Excel: Store Name, POS-*)
  store_name: string | null
  store_street: string | null
  store_zip: string | null
  store_city: string | null
  store_country_code: string | null
  store_country_name: string | null
  store_phone: string | null
  store_email: string | null
}

/**
 * Felder zum Anlegen/Bearbeiten eines Händlers.
 * `name` ist Pflicht; org_id/agent_id/Zeitstempel und `kundennummer` werden NICHT
 * vom Formular gesetzt (org_id kommt aus dem Profil, agent_id folgt später,
 * kundennummer vergibt bei Neuanlage der DB-Default und ist bei Bestehenden
 * unveränderlich). `payment_terms_raw` wird beim Speichern aus den
 * strukturierten Konditionen abgeleitet, nicht von Hand getippt.
 */
export interface DealerInput {
  name: string
  short_name: string | null
  company_name: string | null
  owner_name: string | null
  contact_name: string | null
  email: string | null
  city: string | null
  country: string | null

  // CRM-Erweiterung
  customer_group: CustomerGroup
  discount_percent: number
  credit_limit: number | null

  // Steuer & Buchhaltung
  uid: string | null
  gegenkonto: number | null

  // Zahlungskonditionen (strukturiert = maßgeblich; raw wird daraus abgeleitet)
  payment_terms_raw: string | null
  skonto_prozent: number | null
  skonto_tage: number | null
  zahlungsziel_tage: number | null

  // Lieferadresse
  shipping_street: string | null
  shipping_zip: string | null
  shipping_city: string | null
  shipping_country_code: string | null
  shipping_country_name: string | null
  shipping_phone: string | null
  shipping_email: string | null
  shipping_email2: string | null

  // Rechnungsadresse
  billing_name: string | null
  billing_street: string | null
  billing_zip: string | null
  billing_city: string | null
  billing_country_code: string | null
  billing_country_name: string | null
  billing_phone: string | null
  billing_email: string | null

  // Store-/POS-Adresse
  store_name: string | null
  store_street: string | null
  store_zip: string | null
  store_city: string | null
  store_country_code: string | null
  store_country_name: string | null
  store_phone: string | null
  store_email: string | null
}
