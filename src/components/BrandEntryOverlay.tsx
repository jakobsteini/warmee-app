import { useState } from 'react'
import { EMPLOYEES, initials, type Employee } from '../lib/employees'
import { useT } from '../i18n'

/** Gold-Akzent für Admin-Karten (dezent, außerhalb der Theme-Tokens). */
const GOLD = '#c9a227'

type Phase = 'brands' | 'employees'

/** Prüft einmalig, ob der Nutzer reduzierte Bewegung wünscht. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Vollbild-Einstiegs-Overlay: Zwei-Marken-Split (WARM ME klickbar, Room With A
 * View gesperrt) → gestaffelte Mitarbeiter-Auswahl. Rein visuelle Persona-Geste
 * ohne Rechteprüfung. Effekte via CSS-Transitions/Keyframes; reduzierte
 * Bewegung wird respektiert (siehe <style> unten).
 */
export default function BrandEntryOverlay({
  onSelect,
}: {
  onSelect: (employee: Employee) => void
}) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('brands')
  const [closing, setClosing] = useState(false)

  const admins = EMPLOYEES.filter((e) => e.is_admin)
  const team = EMPLOYEES.filter((e) => !e.is_admin)

  function choose(employee: Employee) {
    setClosing(true)
    // Sanftes Ausblenden, dann in die App. Bei reduzierter Bewegung sofort.
    const delay = prefersReducedMotion() ? 0 : 420
    window.setTimeout(() => onSelect(employee), delay)
  }

  return (
    <div
      className={[
        'entry-anim fixed inset-0 z-50 overflow-hidden bg-surface',
        closing ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      style={{ transition: 'opacity 420ms ease' }}
      role="dialog"
      aria-modal="true"
    >
      {/* ─── Marken-Split ───────────────────────────────────────────────── */}
      <div className="flex h-full w-full">
        {/* WARM ME – klickbar, expandiert in Phase "employees" */}
        <button
          type="button"
          onClick={() => phase === 'brands' && setPhase('employees')}
          disabled={phase !== 'brands'}
          aria-label="WARM ME"
          className="entry-anim group relative flex h-full flex-col items-center justify-center border-r-[0.5px] border-line focus:outline-none"
          style={{
            width: phase === 'brands' ? '50%' : '100%',
            transition: 'width 700ms cubic-bezier(.76,0,.24,1)',
          }}
        >
          <div
            className="entry-anim flex flex-col items-center gap-5 px-8"
            style={{ transition: 'transform 700ms cubic-bezier(.76,0,.24,1)' }}
          >
            <LogoSlot label="warm_me_logo" hint={t('entry.logoHint')} />
            <span className="text-sm font-medium uppercase tracking-[6px] text-ink">
              WARM ME
            </span>
          </div>
          {/* Hover-Tint nur in der Marken-Phase */}
          {phase === 'brands' && (
            <span className="entry-anim pointer-events-none absolute inset-0 bg-ink/0 transition-colors duration-500 group-hover:bg-ink/[0.04]" />
          )}
        </button>

        {/* Room With A View – gesperrt, blendet in Phase "employees" aus */}
        <div
          aria-label="Room With A View"
          aria-disabled="true"
          className="entry-anim relative flex h-full flex-col items-center justify-center bg-card/40"
          style={{
            width: phase === 'brands' ? '50%' : '0%',
            opacity: phase === 'brands' ? 1 : 0,
            transition:
              'width 700ms cubic-bezier(.76,0,.24,1), opacity 500ms ease',
          }}
        >
          <div className="flex select-none flex-col items-center gap-5 px-8 opacity-60">
            <LogoSlot label="rwav_logo" hint={t('entry.logoHint')} />
            <span className="whitespace-nowrap text-sm font-medium uppercase tracking-[6px] text-muted">
              Room With A View
            </span>
          </div>
          <span
            className="mt-6 rounded-full border-[0.5px] px-3 py-1 text-xs uppercase tracking-wider"
            style={{ borderColor: GOLD, color: GOLD }}
          >
            {t('entry.comingSoon')}
          </span>
        </div>
      </div>

      {/* ─── Mitarbeiter-Auswahl (über dem expandierten WARM ME) ─────────── */}
      {phase === 'employees' && (
        <div className="entry-fade absolute inset-0 flex flex-col items-center justify-center bg-surface px-6">
          <button
            type="button"
            onClick={() => setPhase('brands')}
            className="entry-anim absolute left-6 top-6 text-sm text-muted transition-colors hover:text-ink"
          >
            ← {t('entry.back')}
          </button>

          <h2 className="mb-10 text-lg font-medium uppercase tracking-[4px] text-ink">
            {t('entry.who')}
          </h2>

          {/* Admins */}
          <SectionLabel>{t('entry.admins')}</SectionLabel>
          <div className="mb-8 flex flex-wrap justify-center gap-6">
            {admins.map((e, i) => (
              <PersonCard
                key={e.id}
                employee={e}
                index={i}
                gold
                onClick={() => choose(e)}
              />
            ))}
          </div>

          {/* Team */}
          <SectionLabel>{t('entry.team')}</SectionLabel>
          <div className="flex max-w-2xl flex-wrap justify-center gap-6">
            {team.map((e, i) => (
              <PersonCard
                key={e.id}
                employee={e}
                index={admins.length + i}
                onClick={() => choose(e)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Komponenten-lokale Keyframes + Reduced-Motion-Fallback. */}
      <style>{`
        @keyframes entryFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes entryFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .entry-fade { animation: entryFade 500ms ease both; }
        .entry-card { animation: entryFadeUp 520ms cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .entry-card, .entry-fade { animation: none !important; }
          .entry-anim { transition: none !important; }
        }
      `}</style>
    </div>
  )
}

/** Platzhalter-Slot für ein späteres Logo-SVG (kein nachgezeichnetes Logo). */
function LogoSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-24 w-40 flex-col items-center justify-center rounded-md border border-dashed border-line text-center">
      <span className="font-mono text-[11px] text-muted">{label}</span>
      <span className="mt-0.5 text-[10px] text-muted/70">{hint}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[11px] uppercase tracking-wider text-muted">
      {children}
    </p>
  )
}

/** Anklickbare Mitarbeiter-Karte mit gestaffelter Einblendung. */
function PersonCard({
  employee,
  index,
  gold,
  onClick,
}: {
  employee: Employee
  index: number
  gold?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="entry-card group flex flex-col items-center gap-2 focus:outline-none"
      style={{ animationDelay: `${120 + index * 70}ms` }}
    >
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-lg font-medium text-ink shadow-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-md"
        style={
          gold
            ? { border: `2px solid ${GOLD}` }
            : { border: '0.5px solid var(--color-line)' }
        }
      >
        {initials(employee.name)}
      </span>
      <span className="text-sm text-ink">{employee.name}</span>
    </button>
  )
}
