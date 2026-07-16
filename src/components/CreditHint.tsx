import { formatEUR } from '../lib/money'
import type { DealerCredit } from '../lib/creditRating'
import { useT } from '../i18n'

/**
 * Kreditlimit-Kontext für die Ordererfassung. Zeigt bei gesetztem Limit die
 * reine Faktenzeile „Offen: X von Y Limit" (offener Betrag aus den bestehenden
 * Rechnungsdaten via `DealerCredit`, keine zweite Berechnung); Überschreitung
 * wird hervorgehoben.
 *
 * BEWUSST keine Bonitäts-Bewertung/Ampel: Die Kundin macht keine
 * Bonitätsprüfung. Ohne gesetztes Kreditlimit gibt es nichts anzuzeigen → die
 * Komponente rendert dann nichts.
 */
export default function CreditHint({
  credit,
  creditLimit = null,
}: {
  credit: DealerCredit | undefined
  creditLimit?: number | string | null
}) {
  const t = useT()

  const limitNum =
    creditLimit === null || creditLimit === undefined || creditLimit === ''
      ? null
      : Number(creditLimit)
  const hasLimit = limitNum !== null && !Number.isNaN(limitNum) && limitNum > 0
  if (!hasLimit) return null

  const open = credit?.openAmount ?? 0
  const overLimit = open > (limitNum as number)

  return (
    <div className="rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink">
      <p className={overLimit ? 'font-medium text-red-800' : 'text-muted'}>
        {t('creditHint.limitLine', {
          open: formatEUR(open),
          limit: formatEUR(limitNum as number),
        })}
        {overLimit ? t('creditHint.limitExceeded') : ''}
      </p>
    </div>
  )
}
