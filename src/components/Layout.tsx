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

/** Aktive Module (Baustein B – Marketing & Newsletter) */
const navItems: NavDef[] = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/dealers', key: 'nav.dealers' },
  { to: '/assets', key: 'nav.assets' },
  { to: '/assets/assign', key: 'nav.assign' },
  { to: '/crop', key: 'nav.crop' },
  { to: '/newsletter', key: 'nav.newsletter' },
]

/** Aktive Module aus Baustein A – Warenwirtschaft */
const warenItems: NavDef[] = [
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
  { to: '/analytics', key: 'nav.analytics' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-white/[0.08] text-cream' : 'text-nav hover:text-cream',
  ].join(' ')

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
          <span className="text-sm font-medium uppercase tracking-[4px] text-accent">
            WARM ME
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {t(item.key)}
            </NavLink>
          ))}

          <div className="mt-6 px-3 pb-2 text-[11px] uppercase tracking-wider text-muted">
            {t('nav.section.warehouse')}
          </div>
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
