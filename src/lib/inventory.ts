import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { proposeDeliveryDischarge } from './inventoryCalc'
import type { DeliveryItemLike } from './inventoryCalc'
import type {
  InventoryMovement,
  InventoryStockRow,
  MovementInput,
  Warehouse,
} from '../types/inventory'

/**
 * Bestandsbewegungen der eigenen Org, neueste zuerst. Optional gefiltert nach
 * Artikel, Lager oder Lieferschein (Letzteres für die Idempotenz-Prüfung der
 * Ausbuchung). RLS scoped auf die eigene Org.
 */
export async function listMovements(
  opts: { productId?: string; warehouse?: Warehouse; deliveryId?: string } = {},
): Promise<InventoryMovement[]> {
  let q = supabase.from('inventory_movements').select('*')
  if (opts.productId) q = q.eq('product_id', opts.productId)
  if (opts.warehouse) q = q.eq('warehouse', opts.warehouse)
  if (opts.deliveryId) q = q.eq('delivery_id', opts.deliveryId)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InventoryMovement[]
}

/**
 * Eine Bewegung erfassen. org_id + created_by werden serverseitig gesetzt; menge
 * muss ≠ 0 sein (die DB-Check erzwingt es zusätzlich). Gibt die Zeile zurück.
 */
export async function createMovement(
  input: MovementInput,
): Promise<InventoryMovement> {
  const rows = await createMovements([input])
  return rows[0]
}

/**
 * Mehrere Bewegungen in einem Insert (z. B. die Ausbuchung eines Lieferscheins
 * über mehrere Positionen). Nullmengen werden herausgefiltert; wirft, wenn
 * nichts zu buchen bleibt. Korrektur = neue Zeile (kein Update — append-only).
 */
export async function createMovements(
  inputs: MovementInput[],
): Promise<InventoryMovement[]> {
  const clean = inputs.filter((i) => i.menge !== 0)
  if (clean.length === 0) {
    throw new Error('Keine Bewegung mit Menge ≠ 0 zu buchen.')
  }

  const [org_id, created_by] = await Promise.all([getMyOrgId(), getMyUserId()])

  const { data, error } = await supabase
    .from('inventory_movements')
    .insert(
      clean.map((i) => ({
        org_id,
        product_id: i.product_id,
        variant_id: i.variant_id ?? null,
        color: i.color ?? null,
        size: i.size ?? null,
        warehouse: i.warehouse,
        menge: i.menge,
        grund: i.grund,
        delivery_id: i.delivery_id ?? null,
        created_by,
      })),
    )
    .select()

  if (error) throw error
  return (data ?? []) as InventoryMovement[]
}

/**
 * Ist-Bestand aus der View inventory_stock (Summe je Dimension). Optional nach
 * Lager oder Artikel gefiltert. RLS gilt über security_invoker der View.
 */
export async function readInventoryStock(
  opts: { productId?: string; warehouse?: Warehouse } = {},
): Promise<InventoryStockRow[]> {
  let q = supabase.from('inventory_stock').select('*')
  if (opts.productId) q = q.eq('product_id', opts.productId)
  if (opts.warehouse) q = q.eq('warehouse', opts.warehouse)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as InventoryStockRow[]
}

/**
 * Vorschlag für die Lieferschein-Ausbuchung: lädt die Positionen des
 * Lieferscheins und leitet die Abgangs-Entwürfe ab (negative Menge, variant_id
 * null). SCHREIBT NICHT — der Mitarbeiter bestätigt (und ergänzt ggf. die
 * Variante), dann erst createMovements. Zusammensetzung aus Bildschirm-Quelle
 * (delivery_items) + Rechenkern (proposeDeliveryDischarge), keine zweite Quelle.
 */
export async function getDeliveryDischargeProposal(
  deliveryId: string,
  warehouse: Warehouse,
): Promise<MovementInput[]> {
  const { data, error } = await supabase
    .from('delivery_items')
    .select('product_id, color, size, quantity')
    .eq('delivery_id', deliveryId)

  if (error) throw error
  return proposeDeliveryDischarge(
    deliveryId,
    (data ?? []) as unknown as DeliveryItemLike[],
    warehouse,
  )
}

/**
 * Ob für diesen Lieferschein schon ausgebucht wurde — Idempotenz-Hinweis fürs
 * UI (die Ein-Klick-Ausbuchung soll nicht doppelt buchen). Die eigentliche
 * Verhinderung liegt bewusst app-seitig (ein Lieferschein erzeugt mehrere
 * Bewegungszeilen, daher kein Unique auf delivery_id).
 */
export async function isDeliveryDischarged(
  deliveryId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('inventory_movements')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_id', deliveryId)

  if (error) throw error
  return (count ?? 0) > 0
}
