import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/notifications'
import type { AppNotification } from '../types/notification'
import type { TranslationKey } from '../i18n/dict'
import { useT } from '../i18n'

/** created_at (ISO) als kurzes Datum + Uhrzeit, oder „—". */
function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Benachrichtigungs-Glocke für die Kopfleiste. Zeigt den Ungelesen-Zähler,
 * öffnet ein Dropdown mit den letzten Einträgen; ein Klick markiert als gelesen
 * und springt zum verlinkten Vorgang. Die Titel werden nach `type` lokalisiert
 * (Fallback: gespeicherter Titel); das `body`-Feld (Händler · Rechnung · Betrag)
 * ist sprachneutral und wird unverändert gezeigt.
 */
export default function NotificationBell() {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)

  async function refreshCount() {
    try {
      setUnread(await getUnreadCount())
    } catch {
      /* still: die Glocke darf die Seite nicht blockieren */
    }
  }

  useEffect(() => {
    refreshCount()
  }, [])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      try {
        setItems(await listNotifications())
      } catch {
        setItems([])
      }
    }
  }

  function label(n: AppNotification): string {
    const key = `notifications.type.${n.type}` as TranslationKey
    const translated = t(key)
    // t() gibt bei unbekanntem Key den Key selbst zurück → Fallback auf Titel.
    return translated === key ? n.title : translated
  }

  async function handleClick(n: AppNotification) {
    setOpen(false)
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id)
        await refreshCount()
      } catch {
        /* still */
      }
    }
    if (n.link) navigate(n.link)
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead()
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      )
      setUnread(0)
    } catch {
      /* still */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('notifications.title')}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-card"
      >
        {/* Glocken-Icon (inline, kein Icon-Paket im Projekt). */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-medium text-cream">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Klick außerhalb schließt das Dropdown. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border-[0.5px] border-line bg-cream shadow-xl">
            <div className="flex items-center justify-between border-b-[0.5px] border-line px-4 py-3">
              <span className="text-sm font-medium text-ink">
                {t('notifications.title')}
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="text-xs text-muted transition-colors hover:text-ink"
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                {t('notifications.empty')}
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={`flex w-full flex-col gap-0.5 border-b-[0.5px] border-line px-4 py-3 text-left transition-colors hover:bg-card ${
                        n.read_at ? '' : 'bg-card/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {!n.read_at && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-700" />
                        )}
                        <span className="text-sm font-medium text-ink">
                          {label(n)}
                        </span>
                      </span>
                      {n.body && (
                        <span className="text-xs text-muted">{n.body}</span>
                      )}
                      <span className="text-[11px] text-muted">
                        {formatWhen(n.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
