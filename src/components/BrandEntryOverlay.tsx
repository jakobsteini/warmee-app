import { useState } from 'react'
import { EMPLOYEES, initials, type Employee } from '../lib/employees'
import { useT } from '../i18n'

/** Gold-Akzent für Admin-Karten (dezent, außerhalb der Theme-Tokens). */
const GOLD = '#c9a227'

/** Öffentliche Logo-Pfade (liegen in public/, per Root-URL geladen). */
const WARM_ME_LOGO = '/warm_me_logo.png'
/** Swap-ready: sobald public/rwav_logo.png existiert, ersetzt es den Platzhalter. */
const RWAV_LOGO = '/rwav_logo.png'

/** Einheitliche, große Logo-Fläche (responsiv). Transparenter Hintergrund. */
const LOGO_SIZE =
  'h-[clamp(140px,18vw,200px)] w-[clamp(140px,18vw,200px)] object-contain'

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
 * ohne Rechteprüfung.
 *
 * Bewegungssprache (konsistent, GPU-freundlich – nur transform/opacity/filter,
 * Ausnahme: der strukturelle Split animiert width):
 *   – Auftritt (ease-out):      cubic-bezier(0.22, 0.61, 0.36, 1)
 *   – Split (weiches ease-in-out): cubic-bezier(0.65, 0, 0.35, 1)
 *   – Ruhe-„Atmen" des Logos:   6 s, kaum merklich
 * prefers-reduced-motion schaltet alle Animationen/Transitions ab (siehe <style>).
 */
export default function BrandEntryOverlay({
  onSelect,
}: {
  onSelect: (employee: Employee) => void
}) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('brands')
  const [closing, setClosing] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [rwavLogoError, setRwavLogoError] = useState(false)

  const admins = EMPLOYEES.filter((e) => e.is_admin)
  const team = EMPLOYEES.filter((e) => !e.is_admin)

  function choose(employee: Employee) {
    setClosing(true)
    const delay = prefersReducedMotion() ? 0 : 460
    window.setTimeout(() => onSelect(employee), delay)
  }

  const isBrands = phase === 'brands'

  return (
    <div
      className={[
        'ov-root fixed inset-0 z-50 overflow-hidden bg-cream',
        closing ? 'ov-closing' : '',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
    >
      {/* ─── Marken-Split (kein harter Trennbalken) ─────────────────────── */}
      <div className="flex h-full w-full">
        {/* WARM ME – klickbar, expandiert in Phase "employees" */}
        <button
          type="button"
          onClick={() => isBrands && setPhase('employees')}
          disabled={!isBrands}
          aria-label="WARM ME"
          className="brand-btn group relative flex h-full flex-col items-center justify-center focus:outline-none"
          style={{
            width: isBrands ? '50%' : '100%',
            transition: 'width 820ms cubic-bezier(0.65, 0, 0.35, 1)',
          }}
        >
          <div className="ov-in-left flex flex-col items-center gap-7 px-8">
            {/* Hover-Skalierung außen, „Atmen" innen (getrennte, transparente Ebenen). */}
            <div className="hoverlift">
              <div className="breathe">
                {logoError ? (
                  <LogoSlot label="warm_me_logo" hint={t('entry.logoHint')} />
                ) : (
                  <img
                    src={WARM_ME_LOGO}
                    alt="WARM ME"
                    onError={() => setLogoError(true)}
                    className={`${LOGO_SIZE} select-none`}
                    draggable={false}
                  />
                )}
              </div>
            </div>
            <span className="text-sm font-medium uppercase tracking-[6px] text-ink">
              WARM ME
            </span>
          </div>
          {/* Sehr dezenter Hover-Tint nur in der Marken-Phase */}
          {isBrands && (
            <span className="tintlayer pointer-events-none absolute inset-0" />
          )}
        </button>

        {/* Room With A View – gesperrt, blendet mit Scale+Blur weich aus */}
        <div
          aria-label="Room With A View"
          aria-disabled="true"
          className="relative flex h-full flex-col items-center justify-center"
          style={{
            width: isBrands ? '50%' : '0%',
            opacity: isBrands ? 1 : 0,
            transform: isBrands ? undefined : 'scale(0.94)',
            filter: isBrands ? undefined : 'blur(6px)',
            transition:
              'width 820ms cubic-bezier(0.65, 0, 0.35, 1), opacity 620ms ease, transform 820ms cubic-bezier(0.65, 0, 0.35, 1), filter 620ms ease',
          }}
        >
          <div className="ov-in-right flex select-none flex-col items-center gap-7 px-8">
            <div className="opacity-70">
              {rwavLogoError ? (
                <LogoSlot label="rwav_logo" hint={t('entry.logoHint')} />
              ) : (
                <img
                  src={RWAV_LOGO}
                  alt="Room With A View"
                  onError={() => setRwavLogoError(true)}
                  className={`${LOGO_SIZE} select-none`}
                  draggable={false}
                />
              )}
            </div>
            <span className="whitespace-nowrap text-sm font-medium uppercase tracking-[6px] text-muted">
              Room With A View
            </span>
            <span
              className="rounded-full border-[0.5px] px-3 py-1 text-xs uppercase tracking-wider"
              style={{ borderColor: GOLD, color: GOLD }}
            >
              {t('entry.comingSoon')}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Leuchtender grüner Mittelstrich (nur in der Marken-Phase) ───── */}
      {isBrands && (
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2"
          aria-hidden="true"
        >
          <div className="relative h-full w-6">
            <span className="divider-glow-2" />
            <span className="divider-glow-1" />
            <span className="divider-core" />
          </div>
        </div>
      )}

      {/* ─── Mitarbeiter-Auswahl (über dem expandierten WARM ME) ─────────── */}
      {phase === 'employees' && (
        <div className="emp-layer absolute inset-0 flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-surface px-6 py-12">
          <button
            type="button"
            onClick={() => setPhase('brands')}
            className="emp-back absolute left-6 top-6 text-sm text-muted transition-colors duration-300 hover:text-ink"
          >
            ← {t('entry.back')}
          </button>

          <h2 className="emp-head mb-12 text-lg font-medium uppercase tracking-[4px] text-ink">
            {t('entry.who')}
          </h2>

          {/* Admins */}
          <SectionLabel delay={120}>{t('entry.admins')}</SectionLabel>
          <div className="mb-12 flex flex-wrap justify-center gap-x-12 gap-y-10">
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
          <SectionLabel delay={120 + admins.length * 80}>
            {t('entry.team')}
          </SectionLabel>
          <div className="flex w-full max-w-md flex-wrap justify-center gap-x-12 gap-y-10 md:max-w-xl lg:max-w-5xl">
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

      {/* Komponenten-lokale Keyframes, Hover-Regeln + Reduced-Motion-Fallback. */}
      <style>{`
        /* Auftritt des gesamten Overlays */
        @keyframes ovRoot { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovClose { from { opacity: 1; } to { opacity: 0; } }
        .ov-root { animation: ovRoot 560ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        .ov-closing { animation: ovClose 460ms cubic-bezier(0.65, 0, 0.35, 1) forwards; }

        /* Gestaffelter Auftritt der beiden Markenhälften (Slide + Fade + micro-scale) */
        @keyframes inFromLeft {
          from { opacity: 0; transform: translateX(-24px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes inFromRight {
          from { opacity: 0; transform: translateX(24px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        .ov-in-left  { animation: inFromLeft  680ms cubic-bezier(0.22, 0.61, 0.36, 1) 140ms both; }
        .ov-in-right { animation: inFromRight 680ms cubic-bezier(0.22, 0.61, 0.36, 1) 220ms both; }

        /* WARM-ME-Kreis: sehr langsames, kaum merkliches „Atmen" */
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.025); }
        }
        .breathe { animation: breathe 6s ease-in-out infinite; will-change: transform; }

        /* Hover: edle Mikro-Anhebung + weicher Schatten; „Atmen" pausiert */
        .hoverlift {
          transition: transform 780ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      filter   780ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .brand-btn:hover .hoverlift {
          transform: scale(1.06);
          filter: drop-shadow(0 12px 26px rgba(43, 58, 45, 0.18));
        }
        .brand-btn:hover .breathe { animation-play-state: paused; }

        /* Hover-Tint (opacity-only, GPU-freundlich) */
        .tintlayer {
          background: var(--color-ink);
          opacity: 0;
          transition: opacity 520ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .brand-btn:hover .tintlayer { opacity: 0.04; }

        /* Mitarbeiter-Ebene + Kopf/Labels */
        @keyframes empLayer { from { opacity: 0; } to { opacity: 1; } }
        .emp-layer { animation: empLayer 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .emp-back { animation: riseIn 560ms cubic-bezier(0.22, 0.61, 0.36, 1) 80ms both; }
        .emp-head { animation: riseIn 620ms cubic-bezier(0.22, 0.61, 0.36, 1) 120ms both; }

        /* Karten: fade + leichtes Aufsteigen + minimale Skalierung, gestaffelt */
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
        .card-in { animation: cardIn 580ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        .card-avatar {
          transition: transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      box-shadow 420ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .card-btn:hover .card-avatar { transform: translateY(-6px) scale(1.05); }

        /* Leuchtender grüner Mittelstrich: Kern + zwei weiche Glow-Ebenen.
           Enden laufen über den vertikalen Verlauf weich zu transparent aus. */
        .divider-core, .divider-glow-1, .divider-glow-2 {
          position: absolute; top: 0; bottom: 0; left: 50%;
          transform: translateX(-50%);
        }
        .divider-core {
          width: 2px; border-radius: 2px;
          background: linear-gradient(to bottom,
            transparent 0%, #2b3a2d 16%, #2b3a2d 84%, transparent 100%);
        }
        .divider-glow-1 {
          width: 5px;
          background: linear-gradient(to bottom,
            transparent 4%, rgba(76,111,82,0.85) 20%, rgba(76,111,82,0.85) 80%, transparent 96%);
          filter: blur(5px);
          animation: dividerPulse 4.6s ease-in-out infinite;
        }
        .divider-glow-2 {
          width: 16px;
          background: linear-gradient(to bottom,
            transparent 8%, rgba(96,131,101,0.5) 26%, rgba(96,131,101,0.5) 74%, transparent 92%);
          filter: blur(16px);
          animation: dividerPulse 4.6s ease-in-out infinite;
        }
        @keyframes dividerPulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 0.95; }
        }

        /* Reduzierte Bewegung: keine großen Bewegungen, alles ruhig einblenden */
        @media (prefers-reduced-motion: reduce) {
          .ov-root, .ov-closing, .ov-in-left, .ov-in-right, .breathe,
          .emp-layer, .emp-back, .emp-head, .card-in,
          .divider-glow-1, .divider-glow-2 {
            animation: none !important;
          }
          .hoverlift, .tintlayer, .card-avatar { transition: none !important; }
          .brand-btn:hover .hoverlift { transform: none; filter: none; }
          .ov-closing { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/** Platzhalter-Slot für ein späteres Logo (kein nachgezeichnetes Logo). */
function LogoSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-[clamp(140px,18vw,200px)] w-[clamp(140px,18vw,200px)] flex-col items-center justify-center rounded-md border border-dashed border-line text-center">
      <span className="font-mono text-[11px] text-muted">{label}</span>
      <span className="mt-0.5 text-[10px] text-muted/70">{hint}</span>
    </div>
  )
}

function SectionLabel({
  children,
  delay,
}: {
  children: React.ReactNode
  delay: number
}) {
  return (
    <p
      className="card-in mb-5 text-[11px] uppercase tracking-wider text-muted"
      style={{ animationDelay: `${delay}ms` }}
    >
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
      className="card-in card-btn group flex flex-col items-center gap-2.5 focus:outline-none"
      style={{ animationDelay: `${180 + index * 80}ms` }}
    >
      <span
        className="card-avatar flex h-[clamp(92px,24vw,120px)] w-[clamp(92px,24vw,120px)] items-center justify-center rounded-full bg-card text-[clamp(1.75rem,6vw,2.25rem)] font-medium text-ink shadow-sm"
        style={
          gold
            ? { border: `3px solid ${GOLD}` }
            : { border: '1px solid var(--color-line)' }
        }
      >
        {initials(employee.name)}
      </span>
      <span className="text-base text-ink">{employee.name}</span>
    </button>
  )
}
