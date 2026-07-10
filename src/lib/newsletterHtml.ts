/**
 * Standalone-HTML für einen WARM ME Newsletter.
 *
 * Festes Layout (CLAUDE.md): schwarzer WARM-ME-Header, 1 Hero-Bild,
 * 2 Produktbilder nebeneinander, Text, Footer. Kein Baukasten.
 *
 * Die Ausgabe ist tabellenbasiert mit Inline-CSS, damit sie ohne externe
 * Stylesheets in Browsern und E-Mail-Clients gleich aussieht. Bilder werden
 * als öffentliche URLs aus dem crops-Bucket eingebunden – die HTML-Datei ist
 * damit vollständig eigenständig und ohne Anhänge versendbar.
 */

/** WARM ME Farbwelt (identisch zu src/index.css). */
const CREAM = '#F9F8F6'
const INK = '#1A1A1A'
const MUTED = '#8A8178'
const CARD = '#F1EFEA'

const FONT =
  "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

/** Für HTML-Text unsichere Zeichen maskieren. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Attributwerte (URLs) maskieren – enthält zusätzlich Anführungszeichen. */
function escAttr(value: string): string {
  return esc(value).replace(/'/g, '&#39;')
}

export interface NewsletterHtmlData {
  title: string
  subjectLine: string | null
  preheader: string | null
  /** Öffentliche URL des Hero-Bilds; leer = Platzhalter (nur Vorschau). */
  heroUrl: string
  /** Genau zwei öffentliche Produktbild-URLs; leer = Platzhalter. */
  productUrls: [string, string]
}

/** Eine Bildzelle: echtes <img> oder grauer Platzhalter (Vorschau ohne Auswahl). */
function imageCell(url: string, height: number, label: string): string {
  if (url) {
    return `<img src="${escAttr(url)}" alt="${escAttr(label)}" width="100%" style="display:block;width:100%;height:auto;border:0;" />`
  }
  return `<div style="display:flex;align-items:center;justify-content:center;height:${height}px;background:${CARD};color:${MUTED};font-size:13px;font-family:${FONT};">${esc(label)}</div>`
}

/**
 * Vollständiges Newsletter-HTML als String erzeugen.
 *
 * Fehlende Bild-URLs werden für die Live-Vorschau durch Platzhalter ersetzt;
 * der Download-Button ist erst aktiv, wenn Hero und beide Produktbilder
 * gewählt sind, sodass die heruntergeladene Datei nie Platzhalter enthält.
 */
export function buildNewsletterHtml(data: NewsletterHtmlData): string {
  const title = esc(data.title.trim() || 'WARM ME Newsletter')
  const subject = esc((data.subjectLine ?? data.title).trim() || 'WARM ME')
  const preheader = (data.preheader ?? '').trim()
  const [product1, product2] = data.productUrls

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM};font-size:1px;line-height:1px;">${esc(preheader)}</div>`
    : ''
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">

<!-- Header -->
<tr>
<td align="center" style="background:${INK};padding:22px 24px;">
<span style="color:${CREAM};font-family:${FONT};font-size:16px;font-weight:500;letter-spacing:4px;text-transform:uppercase;">WARM ME</span>
</td>
</tr>

<!-- Hero -->
<tr>
<td style="padding:0;">
${imageCell(data.heroUrl, 400, 'Hero-Bild')}
</td>
</tr>

<!-- Titel -->
<tr>
<td style="padding:32px 32px 8px 32px;font-family:${FONT};">
<h1 style="margin:0;color:${INK};font-size:22px;font-weight:500;line-height:1.3;">${title}</h1>
</td>
</tr>

<!-- Produktbilder nebeneinander -->
<tr>
<td style="padding:16px 24px 8px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
${imageCell(product1, 260, 'Produktbild 1')}
</td>
<td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
${imageCell(product2, 260, 'Produktbild 2')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td align="center" style="padding:32px 24px;font-family:${FONT};">
<p style="margin:0 0 6px 0;color:${INK};font-size:13px;font-weight:500;letter-spacing:2px;text-transform:uppercase;">WARM ME</p>
<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;">Slow Fashion Cashmere · Salzburg<br />100% mongolian cashmere · handmade in Nepal</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`
}
