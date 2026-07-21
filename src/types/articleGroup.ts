/** Eine Artikel-Gruppe für Auswertungen (snake_case wie in der DB). */
export interface ArticleGroup {
  id: string
  org_id: string
  name: string
  created_at: string | null
}
