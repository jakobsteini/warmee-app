# WARM ME – Marketing-Tool & Warenwirtschaft

## Kontext

Kunde: WARM ME, Slow Fashion Cashmere, Salzburg, seit 2011.
Auftraggeber-Kontakt: Theresa (Geschäftsführung).
Entwickler: JS Vision (Einzelunternehmen, Jakob Steiner).

WARM ME hat zwei Bereiche:
1. **Händlerbetreuung (B2B-Fachhandel)** – CRM, Ordererfassung, Lieferscheine, Rechnungen, offene Zahlungen, Termine
2. **Marketing & Online** – Instagram, Mailchimp, Shopify (D2C), Bildmaterial

## Reihenfolge

**ZUERST Baustein B (Marketing-Tool)**, danach Baustein A (Warenwirtschaft).

### Baustein B — Marketing & Newsletter (aktueller Fokus)
1. Händlerliste (schlank) — Name, Ansprechpartner, E-Mail
2. Bildarchiv — Upload, Metadaten, Zuordnung zu Kollektion/Saison/Händler
3. Zuschnitt-Editor — 4:5, 3:4, 9:16, Newsletter-Format
4. Newsletter-Generator — Händler wählen → nur dessen Bilder → Vorschau
5. Ausgabe — HTML-Download (KEIN Mailchimp-Push)

### Baustein A — Warenwirtschaft (später)
A1 Händler-CRM → A2 Artikelanlage → A3 Ordererfassung (intern, nicht Händlerportal) →
A4 Nepal-Bestellung → A5 Wareneingang/Verteilung → A6 Lieferschein/Rechnung →
A7 Open-Payment-Liste

Eine **deutsche Agentin** (DE/CH) bekommt Lesezugriff auf den Katalog der
aktuellen Saison und kann Orders für ihre eigenen Kunden erfassen. Sie sieht
keine Rechnungen, keine Nepal-Bestellung, keine anderen Kunden. Rolle: agent.

### Baustein C — Room with a View (viel später)
Schwesteragentur, Modevertrieb, ~15 Marken. Ablöse von GH Order (Deniba Wien).
Kommt erst, wenn A und B laufen.

## Airtable-Struktur (Referenz, nicht 1:1 nachbauen)

Das bestehende Airtable hat:
- **New Content**: Newsletter, Instagram Carousel, Instagram Post, AI Chat (Views)
  - Newsletter-Record: Titel, Content Type, Status, Template, Hero Image,
    Product Images (genau 2), Prompt, Preview, Preheader, Mailchimp-Integration
- **Product Database**: 78 Produkte
  - Product Name, Category (hat/sweater/scarf/cardigan), Color (multi),
    Fit, Gender, Measurements, Origin (immer Nepal), Quality (100% mongolian cashmere),
    Retail Price, Wholesale Price, Season (FW25), Size, Hero Image, Assets
- **Assets**: Gallery View
  - Name, Asset Kind (Photo/Video), Asset Type (Product/Lifestyle),
    Attachments, Product Information (Link), Status (Done)
- **Feedback**: Brand Buddy Feedback

**Was im Airtable FEHLT und wir neu erschaffen:**
- Händler-Zuordnung pro Bild (asset_dealers)
- Saison-Feld auf Assets
- Zuschnitt-Funktion
- Automatische Newsletter-Generierung pro Händler

## Newsletter-Layout (aus Airtable abgelesen)

Ein Newsletter besteht aus genau:
- 1 Hero-Bild (oben, groß)
- 2 Produktbilder (darunter, nebeneinander)
- Text (Betreff, Preheader)
- Footer

Kein Baukastensystem. Drei Bilder, fertig.

## Bildmaterial

- Format: **immer JPEG**, hochauflösend (~1.2 MB, ~2000-3000px)
- TIFFs existieren, werden aber NICHT im System gespeichert
- Kein Original-Archiv nötig — die JPEG ist die Arbeitsversion
- **sRGB-Konvertierung** bei allen Ableitungen (Zuschnitte), da Fotografen
  oft Adobe RGB liefern → Browser zeigt sonst falsche Farben
- Zuschnitt-Formate: 4:5 (Instagram Feed), 3:4 (Grid), 9:16 (Story/Reel), Newsletter (600px breit)

## Design

Farbwelt ist eine Mischung aus roomwithaview.at (schwarz-weiß, editorial)
und warm-me.com (warme Sand/Creme-Naturtöne).

- Hintergrund: #F9F8F6 (Off-White mit Wärme)
- Text: #1A1A1A (Fast-Schwarz)
- Sekundärtext: #8A8178 (Warm-Grau)
- Borders: #C5BFBA (Sanftes Warm-Grau)
- Cards/Stats: #F1EFEA (Helles Warm-Grau)
- Sidebar: #1A1A1A (Schwarz), mit WARM ME Logo in letter-spacing: 4px uppercase
- Active Nav: rgba(255,255,255,0.08) Hintergrund
- Inactive Nav: #9A9590 bzw. #8A8178
- Buttons primary: #1A1A1A Hintergrund, #F9F8F6 Text
- Buttons secondary: transparent, 0.5px solid #C5BFBA
- Filter-Pills aktiv: #1A1A1A bg, #F9F8F6 text
- Filter-Pills inaktiv: transparent, 0.5px solid #C5BFBA
- Schrift: DM Sans (oder Inter als Fallback)
- Keine blauen Buttons, kein Tech-Look, kein Bootstrap
- Viel Weißraum, große Bilder, wenig UI-Noise
- Sidebar zeigt auch zukünftige Module (Händler, Artikel, Orders) ausgegraut

## Multi-Tenant

org_id auf JEDER Tabelle, ab Tag 1. RLS auf jeder Tabelle.
Auch solange nur WARM ME als Mandant existiert.
Room with a View wird später als zweite Organisation hinzugefügt.

## Tech Stack

- **Frontend:** Vite + React + TypeScript
- **Styling:** Tailwind CSS
- **DB / Auth / Storage:** Supabase (Postgres, Frankfurt)
  - Projekt: wyddahfnxiilootylcwg
- **Bildverarbeitung:** Cropper.js (Zuschnitt im Browser)
- **PDF (später, Baustein A):** clientseitig, Supabase Storage

## Regeln

- **Ein Modul pro Session.** Kein "bau die ganze App".
- **Plan Mode bei großen Änderungen.** Erst Plan, dann Code.
- **Migrations statt Klicken.** Schemaänderungen als SQL in supabase/migrations/.
- **RLS niemals deaktivieren.** Auch nicht "temporär zum Testen".
- **Keine Secrets im Code.** Alles über .env, .env steht in .gitignore.
- **Deutsche Feldnamen im UI, englische im Code.** DB-Spalten englisch/snake_case.
- Nach jedem funktionierenden Modul: git commit.
- Newsletter/Instagram/Shopify-Automatisierung gehört NICHT in diese Codebase.
  Wenn ein Task in diese Richtung geht: nachfragen, nicht bauen.

## Datenschutz

Echte Kundendaten (Händler-Stammdaten). AVV nach DSGVO Art. 28 existiert.
Keine Kundendaten in Logs. Keine Testdaten aus Produktion.

## Build & Test

```bash
npm run dev        # Dev-Server (localhost:5173)
npm run build      # Production Build
npm run typecheck  # TypeScript prüfen — vor jedem Commit
```
