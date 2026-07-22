import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  returnedQuantities,
  remainingReturnable,
  canReturnQuantity,
  returnTotal,
  openAfterReturns,
  type ReturnableItem,
  type ExistingReturn,
} from './returnsCalc.ts'

// Eine Rechnung mit zwei Positionen: A (10 Stück), B (4 Stück).
const ITEMS: ReturnableItem[] = [
  { id: 'A', quantity: 10 },
  { id: 'B', quantity: 4 },
]

/** Kurzschreibweise für einen bestehenden Retouren-Vorgang. */
function ret(
  status: 'recorded' | 'cancelled',
  items: { invoice_item_id: string; quantity: number }[],
): ExistingReturn {
  return { status, items }
}

test('Teilretoure: mindert die noch retournierbare Menge der Position', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'A', quantity: 3 }])])
  assert.equal(rem.get('A'), 7) // 10 − 3
  assert.equal(rem.get('B'), 4) // unberührt
})

test('Retoure über die gelieferte Menge hinaus muss scheitern', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'A', quantity: 8 }])])
  const restA = rem.get('A') ?? 0 // 2
  assert.equal(canReturnQuantity(restA, 2), true) // exakt der Rest ist ok
  assert.equal(canReturnQuantity(restA, 3), false) // eins zu viel → blockt
  // Auch direkt gegen die volle Menge: mehr als geliefert geht nie.
  assert.equal(canReturnQuantity(10, 11), false)
})

test('canReturnQuantity: nur positive ganze Zahlen', () => {
  assert.equal(canReturnQuantity(5, 0), false)
  assert.equal(canReturnQuantity(5, -1), false)
  assert.equal(canReturnQuantity(5, 2.5), false)
  assert.equal(canReturnQuantity(5, 5), true)
})

test('mehrere Retouren auf dieselbe Rechnung summieren sich', () => {
  const existing = [
    ret('recorded', [{ invoice_item_id: 'A', quantity: 3 }]),
    ret('recorded', [{ invoice_item_id: 'A', quantity: 2 }, { invoice_item_id: 'B', quantity: 1 }]),
  ]
  assert.equal(returnedQuantities(existing).get('A'), 5) // 3 + 2
  const rem = remainingReturnable(ITEMS, existing)
  assert.equal(rem.get('A'), 5) // 10 − 5
  assert.equal(rem.get('B'), 3) // 4 − 1
})

test('Storno zählt nicht: cancelled-Vorgang mindert nichts', () => {
  const existing = [
    ret('recorded', [{ invoice_item_id: 'A', quantity: 2 }]),
    ret('cancelled', [{ invoice_item_id: 'A', quantity: 6 }]), // storniert → ignoriert
  ]
  assert.equal(returnedQuantities(existing).get('A'), 2)
  assert.equal(remainingReturnable(ITEMS, existing).get('A'), 8) // 10 − 2, nicht 10 − 8
})

test('remainingReturnable clampt bei 0 (kein negativer Rest)', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'B', quantity: 4 }])])
  assert.equal(rem.get('B'), 0)
})

test('returnTotal: Netto/USt/Brutto (20 %), robust gegen numeric-Strings', () => {
  // 3 × 19,90 = 59,70 netto → 11,94 USt → 71,64 brutto
  assert.deepEqual(returnTotal([{ quantity: 3, unit_price: '19.90' }]), {
    net: 59.7,
    tax: 11.94,
    gross: 71.64,
  })
  // 2 × 10 + 1 × 5,50 = 25,50 netto → 5,10 USt → 30,60 brutto
  assert.deepEqual(
    returnTotal([
      { quantity: 2, unit_price: 10 },
      { quantity: 1, unit_price: 5.5 },
    ]),
    { net: 25.5, tax: 5.1, gross: 30.6 },
  )
  assert.deepEqual(returnTotal([]), { net: 0, tax: 0, gross: 0 })
})

test('returnTotal: brutto = netto + USt (Rundung auf Cent)', () => {
  const a = returnTotal([{ quantity: 1, unit_price: '33.33' }])
  assert.equal(a.gross, Math.round((a.net + a.tax) * 100) / 100)
})

// NEU (Teil 4): Satz-Parameter — die Gutschrift erbt den eingefrorenen Satz der
// Rechnung. Der Default (kein Argument) bleibt unverändert 20 %.
test('returnTotal: Satz 0 (Reverse Charge) → USt 0, brutto = netto', () => {
  assert.deepEqual(returnTotal([{ quantity: 3, unit_price: '19.90' }], 0), {
    net: 59.7,
    tax: 0,
    gross: 59.7,
  })
})

test('returnTotal: OSS-Satz 0.19 wird angewandt', () => {
  // 3 × 19,90 = 59,70 netto; 19 % = 11,343 → 11,34; brutto 71,04.
  assert.deepEqual(returnTotal([{ quantity: 3, unit_price: '19.90' }], 0.19), {
    net: 59.7,
    tax: 11.34,
    gross: 71.04,
  })
})

test('returnTotal: Default-Satz (kein Argument) bleibt 20 % — unveränderte Altlogik', () => {
  const explicit = returnTotal([{ quantity: 3, unit_price: '19.90' }], 0.2)
  const dflt = returnTotal([{ quantity: 3, unit_price: '19.90' }])
  assert.deepEqual(dflt, explicit)
})

test('openAfterReturns: offener Rest, nie unter 0', () => {
  assert.equal(openAfterReturns('100.00', 30), 70)
  assert.equal(openAfterReturns(100, 100), 0) // voll gutgeschrieben
  assert.equal(openAfterReturns(100, 140), 0) // clamp, kein Negativbetrag
})

test('offener Rest (Modul 3): Rechnungsbrutto − Σ Retouren-Brutto', () => {
  // Rechnung brutto 238,80. Retoure 3 × 19,90 netto → 71,64 brutto.
  const r1 = returnTotal([{ quantity: 3, unit_price: '19.90' }]).gross
  assert.equal(r1, 71.64)
  assert.equal(openAfterReturns('238.80', r1), 167.16)

  // Zweite Retoure 2 × 10 netto → 24,00 brutto; Summe der recorded Retouren.
  const r2 = returnTotal([{ quantity: 2, unit_price: 10 }]).gross
  assert.equal(r2, 24)
  assert.equal(openAfterReturns('238.80', r1 + r2), 143.16)
})

test('offener Rest (Modul 3): voll retourniert → 0 (wird ausgeblendet)', () => {
  const gross = returnTotal([{ quantity: 5, unit_price: '19.90' }]).gross // 119,40
  assert.equal(openAfterReturns('119.40', gross), 0)
})

// ─── S6b: LS-verankerte Retoure nutzt denselben Mengen-Kern ──────────────────
// remainingReturnable ist key-agnostisch: der „invoice_item_id"-Schlüssel trägt
// bei LS-Retouren die delivery_note_item_id. Restmengen rechnen identisch.
test('remainingReturnable: generischer Schlüssel gilt auch für LS-Positionen', () => {
  const lsItems: ReturnableItem[] = [
    { id: 'dni-1', quantity: 8 },
    { id: 'dni-2', quantity: 3 },
  ]
  const existing: ExistingReturn[] = [
    { status: 'recorded', items: [{ invoice_item_id: 'dni-1', quantity: 5 }] },
    { status: 'cancelled', items: [{ invoice_item_id: 'dni-2', quantity: 3 }] },
  ]
  const rem = remainingReturnable(lsItems, existing)
  assert.equal(rem.get('dni-1'), 3) // 8 − 5 recorded
  assert.equal(rem.get('dni-2'), 3) // Storno zählt nicht
})
