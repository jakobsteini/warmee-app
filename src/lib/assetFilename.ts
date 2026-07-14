/**
 * Ableitung von Metadaten aus WARM-ME-Bilddateinamen.
 *
 * Die 94 Produktbilder folgen einem strukturierten Namensmuster. Statt die
 * Metadaten für jedes Bild von Hand zu tippen, liest dieser reine Parser aus
 * dem Dateinamen so viel wie möglich heraus, um den Upload vorzubefüllen.
 *
 * Bekannte Muster (jeweils ohne Endung .JPG/.jpg/.jpeg):
 *   - "530_olivine"                              → nur Farbcode + Farbname
 *   - "EmyShaded_530_olivine_531_mayfly"         → Modell + zwei Farbpaare
 *   - "Celia_524_vegBrown_525_greige"            → Modell + zwei Farbpaare
 *   - "HairTie_SocialMedia"                      → Modell + Social-Media-Variante
 *
 * Struktur eines Namens (Trenner: "_" oder Leerzeichen):
 *   [Modell-Tokens]  ( Farbcode  Farbname* )*  [SocialMedia]
 * Ein Farbcode ist ein rein numerisches 3–4-stelliges Token (z. B. 530, 524).
 * Alles vor dem ersten Farbcode ist der Modellname; jeder Farbcode "sammelt"
 * die folgenden Nicht-Code-Tokens als seinen Farbnamen ein.
 */

import type { AssetFileMeta } from '../types/asset'

/** Ein Farbcode mit dem zugehörigen Farbnamen (falls im Namen vorhanden). */
export interface ParsedColor {
  /** Numerischer Farbcode, z. B. "530". */
  code: string
  /** Farbname wie im Dateinamen, z. B. "olivine". Null, wenn keiner folgt. */
  name: string | null
}

/** Ergebnis des Dateinamen-Parsers. */
export interface ParsedAssetFilename {
  /** Modellname (z. B. "EmyShaded") oder null, wenn nur Farbe im Namen steht. */
  model: string | null
  /** Farbcode/Farbname-Paare in Reihenfolge des Auftretens. */
  colors: ParsedColor[]
  /** True, wenn der Name eine "_SocialMedia"-Variante kennzeichnet. */
  isSocialMedia: boolean
  /** Bequemer Direktzugriff: alle Farbcodes in Reihenfolge. */
  colorCodes: string[]
  /** Bequemer Direktzugriff: alle Farbnamen (ohne Lücken) in Reihenfolge. */
  colorNames: string[]
}

/** Ein rein numerisches 3–4-stelliges Token gilt als Farbcode. */
function isColorCode(token: string): boolean {
  return /^\d{3,4}$/.test(token)
}

/** Ein Token, das die Social-Media-Variante kennzeichnet. */
function isSocialMediaToken(token: string): boolean {
  return token.toLowerCase() === 'socialmedia'
}

/** Endung entfernen (nur echte Bild-Endungen, um Farbnamen nicht zu kürzen). */
function stripExtension(filename: string): string {
  return filename.replace(/\.(jpe?g|png|tiff?)$/i, '')
}

/**
 * Metadaten aus einem einzelnen Dateinamen ableiten.
 *
 * Robuste, verlustfreie Heuristik: unbekannte Tokens vor dem ersten Farbcode
 * werden zum Modell, ein dangling Farbcode ohne folgenden Namen bleibt mit
 * name=null erhalten, und ein Name ohne vorangehenden Code (untypisch) landet
 * im Modell. Gibt bei leerem/degeneriertem Namen ein leeres Ergebnis zurück.
 */
export function parseAssetFilename(filename: string): ParsedAssetFilename {
  const base = stripExtension(filename.trim())

  // Auf "_" und Leerzeichen zerlegen, leere Tokens (z. B. "__") verwerfen.
  const tokens = base.split(/[_\s]+/).filter((t) => t.length > 0)

  let isSocialMedia = false
  const kept: string[] = []
  for (const token of tokens) {
    if (isSocialMediaToken(token)) {
      isSocialMedia = true
      continue // Marker fließt nicht in Modell/Farbe ein.
    }
    kept.push(token)
  }

  const firstCodeIdx = kept.findIndex(isColorCode)

  // Alles vor dem ersten Farbcode ist der Modellname. Gibt es keinen Code,
  // sind alle verbliebenen Tokens der Modellname (z. B. "HairTie").
  const modelTokens = firstCodeIdx === -1 ? kept : kept.slice(0, firstCodeIdx)
  const model = modelTokens.length > 0 ? modelTokens.join(' ') : null

  // Ab dem ersten Farbcode: jeder Code sammelt die folgenden Nicht-Code-Tokens
  // als seinen Farbnamen ein.
  const colors: ParsedColor[] = []
  if (firstCodeIdx !== -1) {
    for (let i = firstCodeIdx; i < kept.length; i++) {
      const token = kept[i]
      if (isColorCode(token)) {
        colors.push({ code: token, name: null })
      } else if (colors.length > 0) {
        const current = colors[colors.length - 1]
        current.name = current.name ? `${current.name} ${token}` : token
      }
    }
  }

  return {
    model,
    colors,
    isSocialMedia,
    colorCodes: colors.map((c) => c.code),
    colorNames: colors.map((c) => c.name).filter((n): n is string => n !== null),
  }
}

/**
 * Parser-Ergebnis in die DB-nahe Upload-Metadatenform übersetzen: erste Farbe
 * als Hauptfarbe, zweite Farbe (falls vorhanden) als Zweitfarbe. Dient als
 * Default für die editierbaren Upload-Felder.
 */
export function metaFromFilename(filename: string): AssetFileMeta {
  const { model, colors, isSocialMedia } = parseAssetFilename(filename)
  return {
    model,
    color_code: colors[0]?.code ?? null,
    color_name: colors[0]?.name ?? null,
    color_code_2: colors[1]?.code ?? null,
    color_name_2: colors[1]?.name ?? null,
    is_social_media: isSocialMedia,
  }
}
