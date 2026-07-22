import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeSegment, archiveFileName } from './belegArchiveCalc.ts'

test('safeSegment: Sonderzeichen/Umlaute → Unterstrich, getrimmt', () => {
  assert.equal(safeSegment('Muster GmbH & Co.'), 'Muster_GmbH_Co')
  assert.equal(safeSegment('  Ähm/Öl  '), 'hm_l')
  assert.equal(safeSegment(''), 'x')
  assert.equal(safeSegment(null), 'x')
})

test('archiveFileName: Schema Belegnummer_Kunde_Datum.pdf', () => {
  assert.equal(
    archiveFileName('2026-0001', 'Muster Händler', '2026-07-22'),
    '2026-0001_Muster_H_ndler_2026-07-22.pdf',
  )
})

test('archiveFileName: LS-Nummer mit Präfix bleibt eindeutig', () => {
  assert.equal(
    archiveFileName('LS-2026-0007', null, '2026-07-22'),
    'LS-2026-0007_x_2026-07-22.pdf',
  )
})
