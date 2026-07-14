import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metaFromFilename, parseAssetFilename } from './assetFilename.ts'

test('nur Farbcode + Farbname: "530_olivine.JPG"', () => {
  assert.deepEqual(parseAssetFilename('530_olivine.JPG'), {
    model: null,
    colors: [{ code: '530', name: 'olivine' }],
    isSocialMedia: false,
    colorCodes: ['530'],
    colorNames: ['olivine'],
  })
})

test('Modell + zwei Farbpaare: "EmyShaded_530_olivine_531_mayfly.JPG"', () => {
  assert.deepEqual(parseAssetFilename('EmyShaded_530_olivine_531_mayfly.JPG'), {
    model: 'EmyShaded',
    colors: [
      { code: '530', name: 'olivine' },
      { code: '531', name: 'mayfly' },
    ],
    isSocialMedia: false,
    colorCodes: ['530', '531'],
    colorNames: ['olivine', 'mayfly'],
  })
})

test('Modell + zwei Farbpaare (camelCase-Farbe): "Celia_524_vegBrown_525_greige.JPG"', () => {
  assert.deepEqual(parseAssetFilename('Celia_524_vegBrown_525_greige.JPG'), {
    model: 'Celia',
    colors: [
      { code: '524', name: 'vegBrown' },
      { code: '525', name: 'greige' },
    ],
    isSocialMedia: false,
    colorCodes: ['524', '525'],
    colorNames: ['vegBrown', 'greige'],
  })
})

test('Social-Media-Variante ohne Farbe: "HairTie_SocialMedia.JPG"', () => {
  assert.deepEqual(parseAssetFilename('HairTie_SocialMedia.JPG'), {
    model: 'HairTie',
    colors: [],
    isSocialMedia: true,
    colorCodes: [],
    colorNames: [],
  })
})

test('Social-Media-Variante mit Farbe: "530_olivine_SocialMedia.jpg"', () => {
  assert.deepEqual(parseAssetFilename('530_olivine_SocialMedia.jpg'), {
    model: null,
    colors: [{ code: '530', name: 'olivine' }],
    isSocialMedia: true,
    colorCodes: ['530'],
    colorNames: ['olivine'],
  })
})

test('Modell + einzelnes Farbpaar: "Emy_531_mayfly.jpeg"', () => {
  assert.deepEqual(parseAssetFilename('Emy_531_mayfly.jpeg'), {
    model: 'Emy',
    colors: [{ code: '531', name: 'mayfly' }],
    isSocialMedia: false,
    colorCodes: ['531'],
    colorNames: ['mayfly'],
  })
})

// ─── Edge Cases ─────────────────────────────────────────────────────────────

test('Edge: mehrteiliger Modellname wird zusammengefügt', () => {
  const r = parseAssetFilename('Big_Wool_Scarf_530_olivine.JPG')
  assert.equal(r.model, 'Big Wool Scarf')
  assert.deepEqual(r.colorCodes, ['530'])
})

test('Edge: Farbcode ohne folgenden Farbnamen (dangling) → name null', () => {
  const r = parseAssetFilename('Celia_524.JPG')
  assert.equal(r.model, 'Celia')
  assert.deepEqual(r.colors, [{ code: '524', name: null }])
  assert.deepEqual(r.colorNames, []) // Lücken fallen aus colorNames heraus
})

test('Edge: mehrteiliger Farbname wird eingesammelt', () => {
  const r = parseAssetFilename('524_veg_brown.JPG')
  assert.deepEqual(r.colors, [{ code: '524', name: 'veg brown' }])
})

test('Edge: doppelte Trenner und Leerzeichen werden toleriert', () => {
  const r = parseAssetFilename('EmyShaded__530_olivine .JPG')
  assert.equal(r.model, 'EmyShaded')
  assert.deepEqual(r.colorCodes, ['530'])
})

test('Edge: leerer/degenerierter Name → leeres Ergebnis', () => {
  assert.deepEqual(parseAssetFilename('.JPG'), {
    model: null,
    colors: [],
    isSocialMedia: false,
    colorCodes: [],
    colorNames: [],
  })
})

test('Edge: Modell mit Ziffern bleibt Modell (kein 3–4-stelliger Code)', () => {
  const r = parseAssetFilename('V2Neck_530_olivine.JPG')
  assert.equal(r.model, 'V2Neck')
  assert.deepEqual(r.colorCodes, ['530'])
})

// ─── metaFromFilename: Adapter Parser → Upload-Metadaten ─────────────────────

test('metaFromFilename: erste Farbe = Hauptfarbe, zweite = Zweitfarbe', () => {
  assert.deepEqual(metaFromFilename('EmyShaded_530_olivine_531_mayfly.JPG'), {
    model: 'EmyShaded',
    color_code: '530',
    color_name: 'olivine',
    color_code_2: '531',
    color_name_2: 'mayfly',
    is_social_media: false,
  })
})

test('metaFromFilename: nur eine Farbe → Zweitfarbe null', () => {
  assert.deepEqual(metaFromFilename('530_olivine.JPG'), {
    model: null,
    color_code: '530',
    color_name: 'olivine',
    color_code_2: null,
    color_name_2: null,
    is_social_media: false,
  })
})

test('metaFromFilename: Social-Media ohne Farbe', () => {
  assert.deepEqual(metaFromFilename('HairTie_SocialMedia.JPG'), {
    model: 'HairTie',
    color_code: null,
    color_name: null,
    color_code_2: null,
    color_name_2: null,
    is_social_media: true,
  })
})
