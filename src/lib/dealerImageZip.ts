// ============================================================================
// ZIP-Download der Händler-Bilder (Teil A), rein clientseitig.
//
// Die Bilder liegen im privaten Bucket `assets`; die Anzeige/den Download
// autorisiert die zeitlich begrenzte Signed-URL (aus listDealerOrderedImages).
// JSZip wird dynamisch importiert, damit die Lib nur beim tatsächlichen Download
// geladen wird. Kein DB-Zugriff, keine Secrets. Nichts wird verändert.
// ============================================================================

import type { AssetWithMeta } from '../types/asset'

/** Blob als Datei-Download anstoßen (wie in exportFile.ts). */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Nicht-leerer, dateisystem-sicherer Name (für ZIP-Datei und Einträge). */
function safeName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return cleaned || fallback
}

/**
 * Eindeutigen ZIP-Eintragsnamen erzeugen: bei Namensgleichheit wird " (2)",
 * " (3)" … vor der Endung eingefügt, damit sich Bilder nicht überschreiben.
 */
function uniqueEntryName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const stem = dot === -1 ? base : base.slice(0, dot)
  const ext = dot === -1 ? '' : base.slice(dot)
  let n = 2
  let candidate = `${stem} (${n})${ext}`
  while (used.has(candidate)) {
    n += 1
    candidate = `${stem} (${n})${ext}`
  }
  used.add(candidate)
  return candidate
}

/** Ergebnis der ZIP-Erzeugung: der Blob (null, wenn kein Bild gepackt wurde). */
export interface DealerImagesZip {
  blob: Blob | null
  zipped: number
  skipped: number
}

/** Sprechender ZIP-Dateiname für einen Händler. */
export function dealerImagesZipName(dealerName: string): string {
  return `${safeName(dealerName, 'Haendler')}_Bilder.zip`
}

/**
 * Die Bilder eines Händlers zu EINER ZIP packen (ohne Download). Lädt jede Datei
 * über ihre Signed-URL. Bilder ohne URL oder mit fehlgeschlagenem Download werden
 * übersprungen und gezählt (kein stiller Verlust). blob=null, wenn nichts ging.
 */
export async function buildDealerImagesZip(
  assets: AssetWithMeta[],
): Promise<DealerImagesZip> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const used = new Set<string>()
  let zipped = 0
  let skipped = 0

  for (const a of assets) {
    if (!a.url) {
      skipped += 1
      continue
    }
    try {
      const resp = await fetch(a.url)
      if (!resp.ok) {
        skipped += 1
        continue
      }
      const blob = await resp.blob()
      zip.file(uniqueEntryName(safeName(a.filename, `${a.id}.jpg`), used), blob)
      zipped += 1
    } catch {
      skipped += 1
    }
  }

  if (zipped === 0) return { blob: null, zipped: 0, skipped }
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, zipped, skipped }
}

/**
 * Die Bilder eines Händlers als eine ZIP herunterladen (Teil A, Direkt-Download).
 * Baut die ZIP und stößt den Browser-Download an.
 *
 * @returns { zipped, skipped } — Anzahl gepackter bzw. übersprungener Bilder.
 */
export async function downloadDealerImagesZip(
  assets: AssetWithMeta[],
  dealerName: string,
): Promise<{ zipped: number; skipped: number }> {
  const { blob, zipped, skipped } = await buildDealerImagesZip(assets)
  if (blob) triggerDownload(blob, dealerImagesZipName(dealerName))
  return { zipped, skipped }
}
