import { useState, type ReactNode } from 'react'
import { EMPLOYEES, initials, type Employee } from '../lib/employees'
import { useT } from '../i18n'

/** Badge-Farbe: warmes Hell-Creme, gut lesbar auf Dunkelgrün. */
const BADGE = '#e8ddc0'

/** Öffentliche Logo-Pfade (liegen in public/, per Root-URL geladen, RGBA). */
const WARM_ME_LOGO = '/warm_me_logo.png'
const RWAV_LOGO = '/rwav_logo.png'

/** Einheitliche Logo-Maße (beide Dateien: gleiche quadratische Leinwand). */
const LOGO_DIM = 'h-[clamp(200px,26vw,290px)] w-[clamp(200px,26vw,290px)]'
/** Feste Höhe der Logo-Reihe – hält beide Logos exakt auf einer Achse. */
const LOGO_ROW = 'h-[clamp(200px,26vw,290px)]'

type Phase = 'brands' | 'employees' | 'rwavSoon'
type Zoom = null | 'warm' | 'rwav'

/** Dauer des Zoom-Through in ms (edel, weich). */
const ZOOM_MS = 900

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Vollbild-Einstiegs-Overlay: Split Beige/Dunkelgrün (WARM ME links, Room With
 * A View rechts) mit weichem Farbverlauf als Grenze. Klick auf ein Logo löst
 * einen „Zoom-Through" aus, der nahtlos in den Mitarbeiter-Screen (WARM ME) bzw.
 * den „kommt bald"-Zustand (RWAV) übergeht. Rein visuelle Persona-Geste ohne
 * Rechteprüfung. prefers-reduced-motion deaktiviert die großen Bewegungen und
 * navigiert direkt (siehe <style> + Handler).
 */
export default function BrandEntryOverlay({
  onSelect,
}: {
  onSelect: (employee: Employee) => void
}) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('brands')
  const [zoom, setZoom] = useState<Zoom>(null)
  const [closing, setClosing] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const admins = EMPLOYEES.filter((e) => e.is_admin)
  const team = EMPLOYEES.filter((e) => !e.is_admin)

  /** Zoom-Through starten, dann (nach Abschluss) in die Zielansicht wechseln. */
  function enter(side: 'warm' | 'rwav') {
    if (zoom || phase !== 'brands') return
    const target: Phase = side === 'warm' ? 'employees' : 'rwavSoon'
    if (prefersReducedMotion()) {
      setPhase(target)
      return
    }
    setZoom(side)
    window.setTimeout(() => {
      setPhase(target)
      setZoom(null)
    }, ZOOM_MS)
  }

  function choose(employee: Employee) {
    setClosing(true)
    const delay = prefersReducedMotion() ? 0 : 460
    window.setTimeout(() => onSelect(employee), delay)
  }

  return (
    <div
      className={[
        'ov-root fixed inset-0 z-50 overflow-hidden bg-cream',
        closing ? 'ov-closing' : '',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
    >
      {/* Hintergrund: EIN weicher Beige→Dunkelgrün-Verlauf (keine Kante, keine
          zwei getrennt eingefärbten Hälften → keine Naht). */}
      {phase === 'brands' && (
        <div
          className={[
            'split-bg absolute inset-0',
            zoom === 'warm' ? 'bg-out' : '',
          ].join(' ')}
          aria-hidden="true"
        />
      )}
      {/* RWAV-Zoom: Dunkelgrün dehnt sich über den ganzen Screen. */}
      {zoom === 'rwav' && (
        <div className="green-in absolute inset-0 bg-ink" aria-hidden="true" />
      )}

      {/* ─── Marken-Split ───────────────────────────────────────────────── */}
      {phase === 'brands' && (
        <div className="relative flex h-full w-full flex-col md:flex-row">
          {/* WARM ME */}
          <button
            type="button"
            onClick={() => enter('warm')}
            aria-label="WARM ME"
            className={[
              'brand-btn group relative flex flex-1 items-center justify-center focus:outline-none',
              zoom === 'rwav' ? 'recede' : '',
            ].join(' ')}
          >
            <div className="ov-in-left flex flex-col items-center gap-6 px-8">
              <div
                className={[
                  'flex items-center justify-center',
                  LOGO_ROW,
                  zoom === 'warm' ? 'zoom-through' : '',
                ].join(' ')}
              >
                <div className="hoverlift">
                  <div className="breathe">
                    {logoError ? (
                      <LogoSlot label="warm_me_logo" hint={t('entry.logoHint')} />
                    ) : (
                      <img
                        src={WARM_ME_LOGO}
                        alt="WARM ME"
                        onError={() => setLogoError(true)}
                        className={`${LOGO_DIM} select-none object-contain`}
                        draggable={false}
                      />
                    )}
                  </div>
                </div>
              </div>
              {/* Unsichtbarer Platzhalter in Badge-Höhe → Logos auf einer Achse. */}
              <BadgeChip invisible>{t('entry.comingSoon')}</BadgeChip>
            </div>
          </button>

          {/* Room With A View */}
          <button
            type="button"
            onClick={() => enter('rwav')}
            aria-label="Room With A View"
            className={[
              'brand-btn group relative flex flex-1 items-center justify-center focus:outline-none',
              zoom === 'warm' ? 'recede' : '',
            ].join(' ')}
          >
            <div className="ov-in-right flex flex-col items-center gap-6 px-8">
              <div
                className={[
                  'flex items-center justify-center',
                  LOGO_ROW,
                  zoom === 'rwav' ? 'zoom-through' : '',
                ].join(' ')}
              >
                <div className="hoverlift">
                  <div className="breathe">
                    <RwavLogo />
                  </div>
                </div>
              </div>
              <div className={zoom === 'rwav' ? 'zoom-fade' : ''}>
                <BadgeChip>{t('entry.comingSoon')}</BadgeChip>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ─── Mitarbeiter-Auswahl (nahtlos aus dem Beige) ─────────────────── */}
      {phase === 'employees' && (
        <div className="emp-layer absolute inset-0 flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-cream px-6 py-12">
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
          <SectionLabel delay={40}>{t('entry.admins')}</SectionLabel>
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
          <SectionLabel delay={60 + admins.length * 50}>
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

      {/* ─── RWAV „kommt bald"-Zustand (Dunkelgrün) ──────────────────────── */}
      {phase === 'rwavSoon' && (
        <div className="emp-layer absolute inset-0 flex flex-col items-center justify-center bg-ink px-6 text-cream">
          <button
            type="button"
            onClick={() => setPhase('brands')}
            className="absolute left-6 top-6 text-sm text-cream/70 transition-colors duration-300 hover:text-cream"
          >
            ← {t('entry.back')}
          </button>
          <RwavLogo />
          <div className="mt-8">
            <BadgeChip>{t('entry.comingSoon')}</BadgeChip>
          </div>
        </div>
      )}

      {/* Komponenten-lokale Keyframes, Hover-Regeln + Reduced-Motion-Fallback. */}
      <style>{`
        /* Weicher Beige→Dunkelgrün-Verlauf (Grenze ~20% der Breite, keine Linie) */
        .split-bg {
          background: linear-gradient(to right,
            var(--color-cream) 0%, var(--color-cream) 40%,
            var(--color-ink) 60%, var(--color-ink) 100%);
        }
        @media (max-width: 767px) {
          .split-bg {
            background: linear-gradient(to bottom,
              var(--color-cream) 0%, var(--color-cream) 42%,
              var(--color-ink) 58%, var(--color-ink) 100%);
          }
        }

        /* Auftritt des Overlays + erstes Erscheinen der Hälften */
        @keyframes ovRoot { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovClose { from { opacity: 1; } to { opacity: 0; } }
        .ov-root { animation: ovRoot 560ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        .ov-closing { animation: ovClose 460ms cubic-bezier(0.65, 0, 0.35, 1) forwards; }
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
          50%      { transform: scale(1.02); }
        }
        .breathe { animation: breathe 6s ease-in-out infinite; will-change: transform; }

        /* Dezenter Hover: leichtes Scale-up */
        .hoverlift {
          transition: transform 620ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .brand-btn:hover .hoverlift { transform: scale(1.05); }
        .brand-btn:hover .breathe { animation-play-state: paused; }

        /* Zoom-Through: gewähltes Logo skaliert über den Viewport, blendet aus */
        @keyframes zoomThrough {
          0%   { transform: scale(1);  opacity: 1; }
          65%  { opacity: 1; }
          100% { transform: scale(16); opacity: 0; }
        }
        .zoom-through {
          animation: zoomThrough ${ZOOM_MS}ms cubic-bezier(0.7, 0, 0.3, 1) forwards;
          transform-origin: center;
          will-change: transform, opacity;
        }
        /* Andere Hälfte weicht zurück; Badge der gewählten Seite blendet aus */
        @keyframes recede {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(0.86); opacity: 0; }
        }
        .recede { animation: recede 680ms cubic-bezier(0.65, 0, 0.35, 1) forwards; }
        @keyframes fadeOut { to { opacity: 0; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        .zoom-fade { animation: fadeOut 280ms ease forwards; }
        .bg-out    { animation: fadeOut 640ms ease forwards; }
        .green-in  { animation: fadeIn  620ms ease forwards; }

        /* Mitarbeiter-Screen: Kopf/Labels dezent, Avatare als schnelle Welle */
        @keyframes empLayer { from { opacity: 0; } to { opacity: 1; } }
        .emp-layer { animation: empLayer 360ms ease both; }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        .emp-back { animation: riseIn 420ms cubic-bezier(0.22, 0.61, 0.36, 1) 40ms both; }
        .emp-head { animation: riseIn 460ms cubic-bezier(0.22, 0.61, 0.36, 1) 60ms both; }

        /* Avatar-Welle: an Ort und Stelle von klein hochwachsen + Fade */
        @keyframes avatarPop {
          from { opacity: 0; transform: scale(0.35); }
          to   { opacity: 1; transform: none; }
        }
        .avatar-pop { animation: avatarPop 360ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        .card-avatar {
          transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .card-btn:hover .card-avatar { transform: translateY(-6px) scale(1.05); }

        @media (prefers-reduced-motion: reduce) {
          .ov-root, .ov-closing, .ov-in-left, .ov-in-right, .breathe,
          .emp-layer, .emp-back, .emp-head, .avatar-pop,
          .zoom-through, .recede, .zoom-fade, .bg-out, .green-in {
            animation: none !important;
          }
          .hoverlift, .card-avatar { transition: none !important; }
          .brand-btn:hover .hoverlift { transform: none; }
          .ov-closing { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/** RWAV-Logo als Maske in Creme umgefärbt (schwarze Linien → hell auf Grün). */
function RwavLogo() {
  return (
    <div
      role="img"
      aria-label="Room With A View"
      className={`${LOGO_DIM} select-none`}
      style={{
        WebkitMaskImage: `url(${RWAV_LOGO})`,
        maskImage: `url(${RWAV_LOGO})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        backgroundColor: 'var(--color-cream)',
      }}
    />
  )
}

/** „kommt bald"-Badge (warmes Creme auf Dunkelgrün). Optional unsichtbar (Platzhalter). */
function BadgeChip({
  children,
  invisible,
}: {
  children: ReactNode
  invisible?: boolean
}) {
  return (
    <span
      aria-hidden={invisible ? 'true' : undefined}
      className={[
        'rounded-full border-[0.5px] px-3 py-1 text-xs uppercase tracking-wider',
        invisible ? 'invisible' : '',
      ].join(' ')}
      style={{ borderColor: BADGE, color: BADGE }}
    >
      {children}
    </span>
  )
}

/** Platzhalter-Slot (nur WARM-ME-Fallback, falls die Datei fehlt). */
function LogoSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex h-[clamp(200px,26vw,290px)] w-[clamp(200px,26vw,290px)] flex-col items-center justify-center rounded-md border border-dashed border-line text-center">
      <span className="font-mono text-[11px] text-muted">{label}</span>
      <span className="mt-0.5 text-[10px] text-muted/70">{hint}</span>
    </div>
  )
}

function SectionLabel({
  children,
  delay,
}: {
  children: ReactNode
  delay: number
}) {
  return (
    <p
      className="avatar-pop mb-5 text-[11px] uppercase tracking-wider text-muted"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </p>
  )
}

/** Anklickbare Mitarbeiter-Karte; Teil der links→rechts laufenden Avatar-Welle. */
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
      className="avatar-pop card-btn group flex flex-col items-center gap-2.5 focus:outline-none"
      style={{ animationDelay: `${60 + index * 50}ms` }}
    >
      <span
        className="card-avatar flex h-[clamp(92px,24vw,120px)] w-[clamp(92px,24vw,120px)] items-center justify-center rounded-full bg-card text-[clamp(1.75rem,6vw,2.25rem)] font-medium text-ink shadow-sm"
        style={
          gold
            ? { border: `3px solid #c9a227` }
            : { border: '1px solid var(--color-line)' }
        }
      >
        {initials(employee.name)}
      </span>
      <span className="text-base text-ink">{employee.name}</span>
    </button>
  )
}
