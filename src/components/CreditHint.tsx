import { formatEUR } from '../lib/money'
import type { CreditRating, DealerCredit } from '../lib/creditRating'
import CreditBadge from './CreditBadge'
import { useT } from '../i18n'

/**
 * Hintergrund-Ton je Ampel-Stufe. Beige/Dunkelgrün für unkritische Stufen
 * (Marken-Look), deutlich getönt (amber/rot) für Beobachten/Kritisch — damit ein
 * säumiger Zahler ins Auge springt, bevor man ihm Ware zusagt.
 */
const TONE: Record<CreditRating, string> = {
  green: 'border-[0.5px] border-line bg-card',
  yellow: 'border-[0.5px] border-amber-600/60 bg-amber-50',
  red: 'border border-red-700/70 bg-red-50',
  neutral: 'border-[0.5px] border-line bg-card',
}

/**
 * Bonitäts-Hinweis für die Ordererfassung. Zeigt die **bestehende** Ampel
 * (`DealerCredit` aus `listDealerCredits`) samt `buildReason`-Text — KEINE zweite
 * Bonitäts-Berechnung. Das Kreditlimit wird nur als Kontext angezeigt
 * (offen von Limit); es fließt bewusst nicht in die Ampel-Regel ein.
 *
 * Es ist ein Hinweis, keine Sperre: Die Order kann trotzdem erfasst werden.
 */
export default function CreditHint({
  credit,
  creditLimit = null,
}: {
  credit: DealerCredit | undefined
  creditLimit?: number | string | null
}) {
  const t = useT()
  const rating: CreditRating = credit?.rating ?? 'neutral'
  // `reason` kommt aus creditRating.buildReason (deutschsprachig, wie im Tooltip
  // der bestehenden Ampel) — bewusst dieselbe Quelle, nicht neu formuliert.
  const reason = credit?.reason ?? 'Keine Rechnungen vorhanden.'

  const limitNum =
    creditLimit === null || creditLimit === undefined || creditLimit === ''
      ? null
      : Number(creditLimit)
  const hasLimit = limitNum !== null && !Number.isNaN(limitNum) && limitNum > 0
  const open = credit?.openAmount ?? 0
  const overLimit = hasLimit && open > (limitNum as number)

  return (
    <div className={`rounded-md px-4 py-3 text-sm text-ink ${TONE[rating]}`}>
      <CreditBadge credit={credit} />
      <p className="mt-1.5 text-ink">{reason}</p>
      {hasLimit && (
        <p className={`mt-1 ${overLimit ? 'font-medium text-red-800' : 'text-muted'}`}>
          {t('creditHint.limitLine', {
            open: formatEUR(open),
            limit: formatEUR(limitNum as number),
          })}
          {overLimit ? t('creditHint.limitExceeded') : ''}
        </p>
      )}
      {rating === 'red' && (
        <p className="mt-2 font-medium text-red-800">
          {t('creditHint.criticalAction')}
        </p>
      )}
    </div>
  )
}
