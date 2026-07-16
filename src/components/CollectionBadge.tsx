import { useT } from '../i18n'

/**
 * „Inkasso"-Badge. Wird in Mahnliste, Händler- und Kundendetail einheitlich
 * verwendet, wenn zu einer Rechnung ein aktiver Inkasso-Fall besteht. Rot, weil
 * es die schwerwiegendste Stufe des Mahnwegs markiert (wie triggers_collection).
 */
export default function CollectionBadge() {
  const t = useT()
  return (
    <span className="inline-flex items-center rounded-full bg-red-700 px-2.5 py-0.5 text-xs text-cream">
      {t('collection.badge')}
    </span>
  )
}
