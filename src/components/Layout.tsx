import { type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCurrentUser } from '../context/CurrentUser'
import BrandEntryOverlay from './BrandEntryOverlay'
import NotificationBell from './NotificationBell'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n/dict'
import type { Lang } from '../i18n/dict'

interface NavDef {
  to: string
  key: TranslationKey
}

/** Übersicht — einzelner Reiter ganz oben, über den Rubriken (ohne Überschrift). */
const overviewItem: NavDef = { to: '/dashboard', key: 'nav.dashboard' }

/** Rubrik NEWSLETTER (Baustein B – Marketing & Bild) */
const newsletterItems: NavDef[] = [
  { to: '/assets', key: 'nav.assets' },
  { to: '/assets/assign', key: 'nav.assign' },
  { to: '/crop', key: 'nav.crop' },
  { to: '/newsletter', key: 'nav.newsletter' },
]

/** Rubrik WARENWIRTSCHAFT (Baustein A) — Händler (Kundenstamm) zuerst. */
const warenItems: NavDef[] = [
  { to: '/dealers', key: 'nav.dealers' },
  { to: '/products', key: 'nav.products' },
  { to: '/suppliers', key: 'nav.suppliers' },
  { to: '/orders', key: 'nav.orders' },
  { to: '/production-orders', key: 'nav.productionOrders' },
  { to: '/deliveries', key: 'nav.deliveries' },
  { to: '/inventory', key: 'nav.inventory' },
  { to: '/invoices', key: 'nav.invoices' },
  { to: '/oss-rates', key: 'nav.ossRates' },
  { to: '/open-payments', key: 'nav.openPayments' },
  { to: '/dunning', key: 'nav.dunning' },
  { to: '/dunning/settings', key: 'nav.dunningSettings' },
  { to: '/commission', key: 'nav.commission' },
  { to: '/defect-returns', key: 'nav.defectReturns' },
  { to: '/analytics', key: 'nav.analytics' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-white/[0.08] text-cream' : 'text-nav hover:text-cream',
  ].join(' ')

/**
 * Rubrik-Überschrift der Sidebar — dezent-veredelt: Cashmere-Akzent (text-accent),
 * feine Trennlinie darüber, weites Letter-Spacing, klein aber klar abgesetzt.
 * Beide Rubriken identisch, damit sie einheitlich „herausstechen".
 */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 mb-1 border-t border-white/10 px-3 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
      {children}
    </div>
  )
}

export default function Layout() {
  const { session, signOut } = useAuth()
  const { t, lang, setLang } = useI18n()
  const { currentUser, setCurrentUser } = useCurrentUser()

  // Persona noch nicht gewählt → Einstiegs-Overlay (pro Sitzung).
  if (!currentUser) {
    return <BrandEntryOverlay onSelect={setCurrentUser} />
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-ink text-nav print:hidden">
        <div className="px-6 py-8">
          <img
            src="/warm-me-wordmark-white.png"
            alt="WARM ME"
            className="h-6 w-auto"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {/* Übersicht — einzeln ganz oben, ohne Rubrik. */}
          <NavLink to={overviewItem.to} className={linkClass}>
            {t(overviewItem.key)}
          </NavLink>

          <SectionHeading>{t('nav.section.newsletter')}</SectionHeading>
          {newsletterItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {t(item.key)}
            </NavLink>
          ))}

          <SectionHeading>{t('nav.section.warehouse')}</SectionHeading>
          {warenItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4">
          {/* Sprachumschalter – lebt im Context, überdauert die Sitzung. */}
          <div className="mb-3 flex gap-1" role="group" aria-label={t('lang.label')}>
            {(['de', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={[
                  'rounded px-2 py-1 text-xs uppercase tracking-wider transition-colors',
                  lang === l
                    ? 'bg-white/[0.12] text-cream'
                    : 'text-muted hover:text-cream',
                ].join(' ')}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mb-2 truncate text-xs text-muted">
            {currentUser.name}
            {session?.user?.email && (
              <span className="text-nav"> · {session.user.email}</span>
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setCurrentUser(null)}
              className="text-left text-sm text-nav transition-colors hover:text-cream"
            >
              {t('nav.switchUser')}
            </button>
            <button
              type="button"
              onClick={signOut}
              className="text-left text-sm text-nav transition-colors hover:text-cream"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto bg-cream">
        {/* Schlanke Kopfleiste — hält die Benachrichtigungs-Glocke. */}
        <header className="flex items-center justify-end border-b-[0.5px] border-line px-10 py-3 print:hidden">
          <NotificationBell />
        </header>
        <div className="flex-1 px-10 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
