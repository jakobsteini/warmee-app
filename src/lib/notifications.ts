import { supabase } from './supabase'
import { getMyOrgId } from './org'
import type { AppNotification, NotificationInput } from '../types/notification'

// ============================================================================
// In-App-Benachrichtigungen. channel bleibt 'in_app', sent_at ungenutzt —
// Vorrüstung für späteren E-Mail-Versand (siehe Migration/Types).
// ============================================================================

/** Wie viele Einträge die Glocke im Dropdown zeigt. */
const RECENT_LIMIT = 20

/** Neueste Benachrichtigungen zuerst (RLS org-scoped). */
export async function listNotifications(
  limit = RECENT_LIMIT,
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as AppNotification[]
}

/** Anzahl ungelesener Benachrichtigungen (read_at is null). */
export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

/** Eine Benachrichtigung als gelesen markieren (idempotent). */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

/** Alle ungelesenen Benachrichtigungen als gelesen markieren. */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

/**
 * Benachrichtigung erzeugen. channel default 'in_app', sent_at bleibt null.
 * org_id wird app-seitig gesetzt (RLS with check verlangt die eigene Org).
 */
export async function createNotification(
  input: NotificationInput,
): Promise<void> {
  const org_id = await getMyOrgId()
  const { error } = await supabase.from('notifications').insert({
    org_id,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    channel: 'in_app',
  })
  if (error) throw error
}

/**
 * E-Mail-Versand protokollieren (nutzt die Vorrüstung channel='email' + sent_at).
 * NUR nach erfolgreichem Versand aufrufen — sent_at belegt den tatsächlichen
 * Versandzeitpunkt.
 */
export async function createEmailNotification(
  input: NotificationInput,
): Promise<void> {
  const org_id = await getMyOrgId()
  const { error } = await supabase.from('notifications').insert({
    org_id,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    channel: 'email',
    sent_at: new Date().toISOString(),
  })
  if (error) throw error
}
