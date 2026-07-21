import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type {
  Order,
  OrderAssignment,
  OrderHeadFields,
  OrderInput,
  OrderItemInput,
  OrderItemWithProduct,
  OrderListRow,
  OrderStatus,
} from '../types/order'

/**
 * Alle Orders der eigenen Org (RLS scoped automatisch), neueste zuerst.
 * Händlername, Saison-Label und die Zeilen-Beträge werden mitgeladen, damit
 * die Übersicht Summen ohne Nachladen rechnen kann.
 */
export async function listOrders(): Promise<OrderListRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, org_id, dealer_id, season_id, order_number, status, assignment, priority, delivery_date_from, delivery_date_to, notes, created_by, created_at, updated_at, dealer:dealers(name), season:seasons(label), order_items(quantity, unit_price)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as OrderListRow[]
}

/** Eine einzelne Order laden. */
export async function getOrder(id: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Order
}

/** Neue Order anlegen (Status = draft). org_id und created_by aus dem Profil. */
export async function createOrder(input: OrderInput): Promise<Order> {
  const [org_id, created_by] = await Promise.all([
    getMyOrgId(),
    getMyUserId(),
  ])

  const { data, error } = await supabase
    .from('orders')
    .insert({ ...input, org_id, created_by })
    .select()
    .single()

  if (error) throw error
  return data as Order
}

/** Status einer Order ändern (Entwurf → Eingereicht → Bestätigt). */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order> {
  const patch: { status: OrderStatus; order_number?: string } = { status }

  // Beim Übergang auf 'confirmed' (= Fertigstellung/AB) eine lückenlose
  // Auftragsnummer ziehen — aber NUR, wenn noch keine gesetzt ist (idempotent:
  // erneutes confirmed vergibt keine zweite Nummer). Race-Sicherheit wie bei der
  // Rechnungsnummer: max+1 aus der DB (next_order_number) + Unique-Constraint
  // (org_id, order_number) fängt eine kollidierende Parallelvergabe ab.
  if (status === 'confirmed') {
    const { data: cur, error: curErr } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', id)
      .single()
    if (curErr) throw curErr
    if (!cur.order_number) {
      const org_id = await getMyOrgId()
      const { data: num, error: numErr } = await supabase.rpc(
        'next_order_number',
        { p_org_id: org_id },
      )
      if (numErr) throw numErr
      patch.order_number = num as string
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

/** Provisions-Zuteilung einer Order aktualisieren. */
export async function updateOrderAssignment(
  id: string,
  assignment: OrderAssignment,
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ assignment })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

/** Notiz einer Order aktualisieren. */
export async function updateOrderNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase.from('orders').update({ notes }).eq('id', id)
  if (error) throw error
}

/** Kopfdaten einer Order aktualisieren (Order-Art, Versand/Lieferung, PO#, …). */
export async function updateOrderHead(
  id: string,
  fields: OrderHeadFields,
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Order
}

/** Order löschen (order_items werden per ON DELETE CASCADE mitgelöscht). */
export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

/** Alle Zeilen einer Order inkl. Produktdaten, in Anlage-Reihenfolge. */
export async function listOrderItems(
  orderId: string,
): Promise<OrderItemWithProduct[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, product:products(name, color)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as OrderItemWithProduct[]
}

/** Neue Zeile zu einer Order hinzufügen. */
export async function addOrderItem(
  orderId: string,
  input: OrderItemInput,
): Promise<void> {
  const { error } = await supabase
    .from('order_items')
    .insert({ ...input, order_id: orderId })
  if (error) throw error
}

/** Einzelne Felder einer Order-Zeile aktualisieren. */
export async function updateOrderItem(
  id: string,
  patch: Partial<OrderItemInput>,
): Promise<void> {
  const { error } = await supabase.from('order_items').update(patch).eq('id', id)
  if (error) throw error
}

/** Order-Zeile löschen. */
export async function deleteOrderItem(id: string): Promise<void> {
  const { error } = await supabase.from('order_items').delete().eq('id', id)
  if (error) throw error
}
