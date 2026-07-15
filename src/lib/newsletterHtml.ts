/**
 * Standalone-HTML für einen WARM ME Newsletter im Design der echten
 * Mailchimp-Vorlagen (CHOCOLATE/BLUE/BROWN).
 *
 * EIN Layout, konstante Marken-Blöcke, nur Bild-Content + eine Akzent-/
 * Bandfarbe variieren (siehe Analyse). Konstante Blöcke (Header-Headline,
 * Showroom-Promo, Werte-Badges, Footer) stecken im Template; pro Newsletter
 * variabel sind Hero, 2 Produktbilder, Intro-Text, „Mehr"-Link und die
 * Akzentfarbe.
 *
 * Tabellenbasiert mit Inline-CSS, damit es ohne externe Stylesheets in Browsern
 * und E-Mail-Clients gleich aussieht. Bilder werden als öffentliche URLs
 * eingebunden (crops-Bucket für Hero/Produkte, newsletter-assets-Bucket für die
 * Marken-Grafiken) – die Datei ist damit eigenständig und ohne Anhänge nutzbar.
 */
import type { NewsletterAssetUrls } from './newsletterAssets'

/** WARM ME Vorlagen-Farbwelt (aus den echten Newslettern abgelesen). */
const CANVAS = '#e8e0d8' // warmes Beige rund um den Container
const PAPER = '#ffffff' // Inhaltsflächen
const TAUPE = '#a08d79' // konstantes Marken-Taupe (Default-Akzent)
const INK = '#1a1a1a'
const MUTED = '#6f665d'

/** E-Mail-sichere Schrift der Vorlagen (Verdana), DM Sans nur als Vorzug. */
const FONT = "'DM Sans', Verdana, Geneva, 'Noto Sans', Arial, sans-serif"

/** Container-Breite der Vorlagen. */
const WIDTH = 660

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

/** Absätze aus mehrzeiligem Text (Leerzeile = neuer Absatz). */
function paragraphs(text: string, color: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;color:${color};font-family:${FONT};font-size:15px;line-height:1.6;">${esc(
          p,
        ).replace(/\n/g, '<br />')}</p>`,
    )
    .join('')
}

export interface NewsletterHtmlData {
  title: string
  subjectLine: string | null
  preheader: string | null
  /** Öffentliche URL des Hero-Bilds; leer = Platzhalter (nur Vorschau). */
  heroUrl: string
  /** Genau zwei öffentliche Produktbild-URLs; leer = Platzhalter. */
  productUrls: [string, string]
  /** Redaktionelle Überschrift des Intro-Blocks (Fallback: title). */
  bodyHeadline: string | null
  /** Redaktioneller Fließtext (mehrzeilig, Leerzeile = Absatz). */
  bodyText: string | null
  /** Optionaler „Mehr…"-Link. */
  linkLabel: string | null
  linkUrl: string | null
  /** Akzent-/Bandfarbe (Hex), Default Taupe. */
  accentColor: string
  /** Öffentliche URLs der konstanten Marken-Grafiken. */
  assets: NewsletterAssetUrls
}

/** Eine Bildzelle: echtes <img> oder grauer Platzhalter (Vorschau ohne Auswahl). */
function imageCell(url: string, height: number, label: string): string {
  if (url) {
    return `<img src="${escAttr(
      url,
    )}" alt="${escAttr(label)}" width="100%" style="display:block;width:100%;height:auto;border:0;" />`
  }
  return `<div style="display:flex;align-items:center;justify-content:center;height:${height}px;background:#f1efea;color:${MUTED};font-size:13px;font-family:${FONT};">${esc(
    label,
  )}</div>`
}

/** Volle Breite eine Markengrafik (mit Link, falls href gesetzt). */
function brandImage(
  url: string,
  alt: string,
  width: number,
  href?: string,
): string {
  const img = `<img src="${escAttr(url)}" alt="${escAttr(
    alt,
  )}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;margin:0 auto;" />`
  return href
    ? `<a href="${escAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>`
    : img
}

/**
 * Vollständiges Newsletter-HTML als String erzeugen.
 *
 * Fehlende Bild-URLs (Hero/Produkte) werden für die Live-Vorschau durch
 * Platzhalter ersetzt; der Download-Button ist erst aktiv, wenn Hero und beide
 * Produktbilder gewählt sind, sodass die heruntergeladene Datei nie Platzhalter
 * enthält. Die konstanten Marken-Grafiken kommen fest aus dem Bucket.
 */
export function buildNewsletterHtml(data: NewsletterHtmlData): string {
  const subject = esc((data.subjectLine ?? data.title).trim() || 'WARM ME')
  const preheader = (data.preheader ?? '').trim()
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(data.accentColor.trim())
    ? data.accentColor.trim()
    : TAUPE
  const headline = (data.bodyHeadline ?? '').trim() || data.title.trim()
  const bodyText = (data.bodyText ?? '').trim()
  const linkLabel = (data.linkLabel ?? '').trim()
  const linkUrl = (data.linkUrl ?? '').trim()
  const [product1, product2] = data.productUrls
  const a = data.assets
  const year = new Date().getFullYear()

  // Intro-Textblock nur, wenn es etwas anzuzeigen gibt.
  const introInner = [
    headline
      ? `<h1 style="margin:0 0 12px 0;color:${INK};font-family:${FONT};font-size:22px;font-weight:600;line-height:1.3;letter-spacing:0.3px;">${esc(
          headline,
        )}</h1>`
      : '',
    bodyText ? paragraphs(bodyText, INK) : '',
    linkLabel && linkUrl
      ? `<p style="margin:6px 0 0 0;font-family:${FONT};font-size:15px;"><a href="${escAttr(
          linkUrl,
        )}" target="_blank" style="color:${accent};text-decoration:none;font-weight:600;">${esc(
          linkLabel,
        )} &rarr;</a></p>`
      : '',
  ].join('')

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS};font-size:1px;line-height:1px;">${esc(preheader)}</div>`
    : ''
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" style="width:${WIDTH}px;max-width:${WIDTH}px;">

<!-- Header-Headline (Marken-Grafik) -->
<tr>
<td align="center" style="padding:8px 24px 20px 24px;">
${brandImage(a.header, 'Coziest news in the world from Warm Me', 550)}
</td>
</tr>

<!-- Hero -->
<tr>
<td style="padding:0;">
${imageCell(data.heroUrl, 400, 'Hero-Bild')}
</td>
</tr>

${
  introInner
    ? `<!-- Intro-Text -->
<tr>
<td style="background:${PAPER};padding:30px 32px 8px 32px;">
${introInner}
</td>
</tr>`
    : ''
}

<!-- Produktbilder nebeneinander -->
<tr>
<td style="background:${PAPER};padding:16px 24px 24px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
${imageCell(product1, 300, 'Produktbild 1')}
</td>
<td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
${imageCell(product2, 300, 'Produktbild 2')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Showroom-Promo auf der Akzent-/Bandfarbe: die Marken-Grafiken sind weiß auf
     transparent (Showroom-Schriftzug) bzw. ein weißer Button mit dunkler Schrift
     und brauchen daher einen farbigen Grund. Dieses Band ist zugleich die einzige
     je Kampagne variierende Chrome-Farbe. -->
<tr>
<td align="center" style="background:${accent};padding:36px 24px 10px 24px;">
${brandImage(a.showroom, 'Visit us in our Warm Me showroom', 520)}
</td>
</tr>
<tr>
<td align="center" style="background:${accent};padding:4px 24px 36px 24px;">
${brandImage(a.appointment, 'Book a private shopping session', 140, 'https://www.warm-me.com/contact/')}
</td>
</tr>

<!-- Werte-Reihe (3 Badges) -->
<tr>
<td style="padding:28px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="33%" align="center" style="padding:0 6px;vertical-align:top;">
${brandImage(a.badgeMindful, 'Mindful luxury', 200)}
</td>
<td width="33%" align="center" style="padding:0 6px;vertical-align:top;">
${brandImage(a.badgeCashmere, 'Finest cashmere', 200)}
</td>
<td width="33%" align="center" style="padding:0 6px;vertical-align:top;">
${brandImage(a.badgeNepal, 'Handmade in Nepal', 200)}
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td align="center" style="padding:24px 24px 8px 24px;font-family:${FONT};">
<p style="margin:0 0 10px 0;color:${INK};font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">WARM ME</p>
<p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;">
<a href="https://facebook.com/warm.me" target="_blank" style="color:${accent};text-decoration:none;">Facebook</a>
&nbsp;&middot;&nbsp;
<a href="https://instagram.com/__warmme" target="_blank" style="color:${accent};text-decoration:none;">Instagram</a>
</p>
<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.7;">
Warm-ME GmbH &middot; Stelzhamerstrasse 5A &middot; 5020 Salzburg &middot; Austria<br />
<a href="mailto:office@warm-me.com" style="color:${accent};text-decoration:none;">office@warm-me.com</a>
&nbsp;&middot;&nbsp;
<a href="https://www.warm-me.com" target="_blank" style="color:${accent};text-decoration:none;">www.warm-me.com</a>
</p>
</td>
</tr>
<tr>
<td align="center" style="padding:8px 24px 24px 24px;font-family:${FONT};">
<p style="margin:0;color:${MUTED};font-size:11px;">&copy; Warm ME GmbH ${year}</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`
}
