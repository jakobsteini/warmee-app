import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface EmptyStateProps {
  /** Kurzer Text, der beschreibt, was diese Seite tut. */
  children: ReactNode
  /** Beschriftung des Buttons zum Anlegen. Ohne Label wird kein Button gezeigt. */
  actionLabel?: string
  /** Klick-Handler (z. B. Formular öffnen). */
  onAction?: () => void
  /** Alternativ: Ziel-Route, falls das Anlegen auf einer anderen Seite passiert. */
  actionTo?: string
  /** Button deaktivieren (z. B. wenn Voraussetzungen fehlen). */
  actionDisabled?: boolean
}

/**
 * Einheitlicher Leer-Zustand für alle Tabellen-Seiten: zentrierter Text plus
 * optionaler Button zum Anlegen. Text in #8A8178 (muted), Button in #1A1A1A (ink).
 */
export default function EmptyState({
  children,
  actionLabel,
  onAction,
  actionTo,
  actionDisabled,
}: EmptyStateProps) {
  const buttonClass =
    'inline-block rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50'

  return (
    <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-16 text-center">
      <p className="mx-auto max-w-md text-sm text-muted">{children}</p>
      {actionLabel &&
        (actionTo ? (
          <Link to={actionTo} className={`${buttonClass} mt-6`}>
            {actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className={`${buttonClass} mt-6`}
          >
            {actionLabel}
          </button>
        ))}
    </div>
  )
}
