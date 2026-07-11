import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Aktive Module (Baustein B – Marketing & Newsletter) */
const navItems = [
  { to: '/dealers', label: 'Händler' },
  { to: '/assets', label: 'Bildarchiv' },
  { to: '/crop', label: 'Zuschnitt' },
  { to: '/newsletter', label: 'Newsletter' },
]

/** Aktive Module aus Baustein A – Warenwirtschaft */
const warenItems = [
  { to: '/products', label: 'Artikel' },
  { to: '/orders', label: 'Orders' },
  { to: '/nepal-orders', label: 'Nepal-Bestellung' },
  { to: '/deliveries', label: 'Wareneingang' },
  { to: '/invoices', label: 'Rechnungen' },
  { to: '/open-payments', label: 'Offene Posten' },
]

/** Zukünftige Module (Baustein A – Warenwirtschaft), noch ausgegraut */
const futureItems: string[] = []

export default function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-ink text-nav print:hidden">
        <div className="px-6 py-8">
          <span className="text-sm font-medium uppercase tracking-[4px] text-cream">
            WARM ME
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-white/[0.08] text-cream'
                    : 'text-nav hover:text-cream',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="mt-6 px-3 pb-2 text-[11px] uppercase tracking-wider text-muted">
            Warenwirtschaft
          </div>
          {warenItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-white/[0.08] text-cream'
                    : 'text-nav hover:text-cream',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
          {futureItems.map((label) => (
            <span
              key={label}
              aria-disabled="true"
              title="Kommt in Baustein A"
              className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted/60"
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4">
          {session?.user?.email && (
            <p className="mb-2 truncate text-xs text-muted">
              {session.user.email}
            </p>
          )}
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-nav transition-colors hover:text-cream"
          >
            Abmelden
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-cream px-10 py-8">
        <Outlet />
      </main>
    </div>
  )
}
