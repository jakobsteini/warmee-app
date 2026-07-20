import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import {
  BRAND_LOGO_BLACK,
  BRAND_LOGO_BLACK_W,
  BRAND_LOGO_BLACK_H,
} from './brandLogo.ts'

test('brandLogo base64 ist ein nicht-leeres PNG-dataURL', () => {
  assert.ok(BRAND_LOGO_BLACK.startsWith('data:image/png;base64,iVBOR'))
  assert.ok(BRAND_LOGO_BLACK.length > 5000)
})

test('jsPDF addImage bettet das schwarze Logo OHNE Fehler ein (kein Fallback)', () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const w = (9 * BRAND_LOGO_BLACK_W) / BRAND_LOGO_BLACK_H
  // Wenn das wirft, greift in pdf.ts der Text-Fallback → Logo fehlt im PDF.
  doc.addImage(BRAND_LOGO_BLACK, 'PNG', 18, 13, w, 9)
  const out = doc.output('arraybuffer')
  assert.ok(out.byteLength > 0)
})
