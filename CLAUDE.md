# WARM ME – Marketing-Tool & Warenwirtschaft

## Kontext

Kunde: WARM ME, Slow Fashion Cashmere, Salzburg, seit 2011.
Auftraggeber-Kontakt: Theresa (Geschäftsführung).
Entwickler: JS Vision (Einzelunternehmen, Jakob Steiner).

WARM ME hat zwei Bereiche:
1. **Händlerbetreuung (B2B-Fachhandel)** – CRM, Ordererfassung, Lieferscheine, Rechnungen, offene Zahlungen, Provision, Mahnwesen, Termine
2. **Marketing & Online** – Instagram, Mailchimp, Shopify (D2C), Bildmaterial

## Modulstand (Stand 2026-07-15)

Ursprünglich war Baustein B (Marketing) zuerst geplant, Baustein A (Warenwirtschaft)
später. Inzwischen sind **beide Bausteine weitgehend gebaut** und laufen als eine App
mit gemeinsamer Sidebar (`src/components/Layout.tsx`).

### Baustein B — Marketing & Newsletter
1. Händlerliste — Name, Ansprechpartner, E-Mail (CRM-Stammdaten, siehe unten)
2. Bildarchiv (`assets`) — Upload, Metadaten, Zuordnung zu Kollektion/Saison/Händler
3. Zuschnitt-Editor (`crops`) — 4:5, 3:4, 9:16, Newsletter-Format
4. Newsletter-Generator — Händler wählen → dessen Bilder → Vorschau → HTML-Download
   - **Neu: Vorlagen-Design.** Ein Layout im WARM-ME-Look (redaktioneller Text +
     Akzentfarbe + konstante Marken-Grafiken). Kein Mailchimp-Push.
5. Ausgabe — HTML-Download (KEIN Mailchimp-Push)

### Baustein A — Warenwirtschaft
Produkte → Ordererfassung (intern) → Produktions-Bestellung (früher „Nepal-Bestellung")
→ Lieferscheine → Rechnungen → Offene Posten → **Provision** → **Mahnwesen** → Analytics.

Eine **deutsche Agentin** (DE/CH) bekommt Lesezugriff auf den Katalog der aktuellen
Saison und kann Orders für ihre eigenen Kunden erfassen (Order-`assignment = 'agent'`).
Sie sieht keine Rechnungen, keine Produktions-Bestellung, keine anderen Kunden.

### Neu dazugekommen (2026-07-15)
- **CRM-Stammdaten:** `dealer_emails` (mehrere Adressen je Händler mit Rolle:
  `order_confirmation` / `invoice` / `delivery`), `dealer_season_priority`
  (Priorität je Händler **pro Saison** für die spätere Warenverteilung, kleiner =
  höher). Zusätzliche `dealers`-Felder: `customer_group` (b2b/b2c),
  `discount_percent`, `credit_limit`; `zahlungsziel_tage` hat jetzt DB-Default 30.
- **Provision:** `commission_settings` (editierbare aktuelle Rate, eine Zeile je Org)
  und `commission_settlements` (Abrechnung als eingefrorenes Dokument). Provision
  basiert auf der **Zuteilung je Order** (`orders.assignment`), NICHT auf dem
  Händlerland, und auf dem **tatsächlich eingegangenen Betrag** (`invoices.paid_amount`).
  - **Stand ec3370f (2026-07-16):** Die Provisionsregel lebt zentral in
    `src/lib/commissionCalc.ts` (`agentGetsCommission`) — Änderungen an der Regel
    **nur dort**; Übersicht und Abrechnung nutzen dieselbe Funktion.
  - **Regel:** Aggregation je **(Händler, Saison)** aus den bestätigten Orders.
    Enthält die Zuteilung `'agent'` (reine Agent- **oder** gemischte Zuteilung
    agent + internal), zählt der **volle eingegangene Betrag** des Händlers zur
    Provision der Agentin — **auch der Anteil aus internen Orders** (Kundenentscheidung
    Theresa). Nur-internal = provisionsfrei.
  - **Zahlung ohne bestätigte Order** in (Händler, Saison): keine Zuteilung
    ableitbar → **amber-Badge** „Zahlung ohne Order" (Datenlage-Hinweis, kein Fehler),
    zählt **nicht** zur Provision. Freie Rechnungen ohne Saisonbezug bleiben still
    unberücksichtigt.
  - **Vorabprovision (Vorschau aus bestätigten Orders) gibt es nicht mehr** —
    ersatzlos entfernt (war nie persistiert, kein DB-Teil überflüssig). Die
    Übersicht zeigt nur die tatsächliche Provision aus eingegangenen Zahlungen.
- **Mahnwesen:** `dunning_levels` (konfigurierbare Stufen: Bezeichnung, Tage nach
  Fälligkeit, Gebühr, Inkasso-Flag) und `dunning_history` (welche Stufe wann je
  Rechnung gesetzt wurde). Scope: Konfiguration + Historie + **Inkasso-Stufe**,
  weiterhin **kein** Mailversand/PDF (E-Mail/DNS für warm-me.com noch ungeklärt).
  - **Stand ae7680b (2026-07-16) — Inkasso-Übergabe + Benachrichtigung:**
  - **`dunning_collections`** (neu): Inkasso-Fall als eingefrorener Snapshot
    (offener Betrag, erreichte Stufe, Bezeichnung, Übergabezeit/-benutzer). Libs:
    `src/lib/dunningCollections.ts`, Rechenkern `dunningCollectionsCalc.ts`
    (supabase-frei, `canHandOver`/`lastConfiguredLevel`, getestet).
  - **Status „Inkasso" ist ABGELEITET**, nicht auf der Rechnung gespeichert: eine
    Rechnung ist in Inkasso, solange ein `dunning_collections`-Fall mit
    `status='active'` existiert (kein Eingriff in `invoices.status` — die
    additive-only-Regel verbietet den CHECK-Constraint-Umbau). Partial-Unique
    `uq_dunning_collections_active` sichert höchstens einen aktiven Fall je
    Rechnung. Der Mahnlauf/die Übersicht überspringt Fälle in Inkasso.
  - **Übergabe:** Button erst ab der **letzten konfigurierten Stufe**, Bestätigungs-
    dialog mit Händler/Rechnung/offenem Betrag. **Rücknahme** („Inkasso zurück-
    ziehen") mit **Pflichtfeld Grund**: **kein Löschen** — `status='withdrawn'` +
    Grund/Benutzer, der Vorgang bleibt Historie, der Status geht (abgeleitet) auf
    die vorherige Mahnstufe zurück. `Inkasso`-Badge (rot) in Mahnliste, Händler-
    und Kundendetail; Inkasso-Historie im Händlerdetail.
  - **`notifications`** (neu, org-scoped RLS): `type/title/body/link/read_at/
    created_at` + `channel`/`sent_at` als **Vorrüstung** für späteren Mailversand
    (aktuell nur `in_app`, `sent_at` ungenutzt → andockbar ohne Migration). Lib
    `src/lib/notifications.ts`. Übergabe **und** Rücknahme lösen je eine
    In-App-Benachrichtigung aus.
  - **Kopfleiste mit Glocke:** Es gab vorher **keinen Header** — die App war reine
    Sidebar. `NotificationBell` sitzt in einer neuen schlanken Kopfleiste oben im
    `<main>` (Ungelesen-Zähler + Dropdown, Klick markiert gelesen + springt zum
    Vorgang). Die Leiste liegt **im scrollenden `<main>` und ist NICHT `sticky`** —
    sie scrollt mit dem Content weg. Auf sticky umstellen bräuchte `sticky top-0`
    + eigenen Hintergrund + z-index (bewusst offen gelassen).
- **Wareneingang** (Abschnitt 4): `goods_receipts` (Kopf, **mehrere je
  Produktionsbestellung** → Teillieferungen) + `goods_receipt_items` (reale
  Eingangsmenge je Nepal-Position, Anker `production_order_item_id`). Erfassen +
  Abgleich sitzen in `GoodsReceiptSection` auf der ProductionOrderEdit-Seite; die
  Lib ist `src/lib/goodsReceipts.ts`.
  - **Ersetzt das reine `received`-Flag:** vorher war „Ware da" nur ein Status,
    jetzt werden die tatsächlich eingegangenen Stück erfasst. Der erste
    Wareneingang hebt `production_orders.status` automatisch auf `received`.
  - **Abgleich** (`getReconciliation`): je Position **Bestellt (Nepal) →
    Eingegangen (real) → Verteilt (an Händler) → Rest**. „Verteilt" wird über den
    Positions-Schlüssel (`itemKey`, Produkt/Farbe/Größe) aus allen `delivery_items`
    der Produktionsbestellung summiert.
  - **Mengenkontrolle:** `generateDeliveries` liefert `{ created, shortfalls }` —
    eine **weiche, bezifferte** Fehlmengen-Warnung (nur wenn ein Wareneingang
    erfasst ist). `updateDeliveryItemQuantity` **blockt hart**, wenn die über alle
    Lieferungen verteilte Summe je Position den Eingang übersteigt. Ohne erfassten
    Wareneingang gilt (wie bisher) keine Obergrenze.
  - `src/lib/itemKey.ts` hält den Positions-Schlüssel neutral, damit sich
    `deliveries` und `goodsReceipts` nicht gegenseitig importieren müssen (kein
    Zyklus); `deliveries.ts` re-exportiert ihn für Altimporte.
- **Kommissionierschein als PDF** (Abschnitt 4): internes Lagerdokument zum
  Ausdrucken und händischen Abarbeiten. **Sammel je Produktionsbestellung** —
  Deckblatt mit dem Abgleich über alle Kunden, danach je Kunde (= je Lieferung)
  eine Seite mit Artikel/Farbe/Größe, **Bestellt** (dieser Kunde) / **Eingang
  (ges.)** / **Komm.** (zu kommissionieren) und Abhak-Kästchen. „Eingang (ges.)"
  ist bewusst als **Pool-Gesamtmenge je Position** beschriftet (nicht je Kunde) —
  Wareneingang wird nie kundenweise zugeordnet.
  - **Datenquelle = Komposition der Bildschirm-Quellen, keine zweite Rechnung**
    (wie bei `dueDates`): `getReconciliation` (Deckblatt + „Eingang"),
    `listDeliveryItems` + `orderedQuantities` (Positionen/„Bestellt" je Kunde).
    Lib: `src/lib/pickingList.ts`; Builder `buildPickingListPdf` in
    `src/lib/pdf.ts` (Stil wie Rechnung/Lieferschein, dunkelgrüne Akzentlinien).
  - **Bewusst NICHT persistiert:** kein Nummernkreis, keine Storage-Ablage, keine
    Migration — Direkt-Download des Blobs (Button im Abgleich auf
    ProductionOrderEdit). Es ist ein Wegwerf-Arbeitspapier, kein Kundenbeleg.
    Deutsch (internes Dokument).
  - **Noch offen:** Einzel-Kunden-Nachdruck auf DeliveryEdit — der Builder nimmt
    schon eine Kundenliste, ist also trivial nachrüstbar. Zurückgestellt bis der
    Praxistest des Sammeldokuments zeigt, dass das Format passt.
- **Kreditlimit-Kontext in der Ordererfassung** (Abschnitt 2.4): bei Auswahl eines
  Händlers zeigt `CreditHint` die reine Faktenzeile „Offen: X von Y Kreditlimit"
  — im „Neue Order"-Modal ([Orders](src/pages/Orders.tsx)) und bleibend auf
  [OrderEdit](src/pages/OrderEdit.tsx). Überschreitung des Limits wird rot
  hervorgehoben (Faktum, kein harter Block). **Ohne gesetztes Kreditlimit rendert
  die Komponente `null`** — keine leere Zeile. Der offene Betrag kommt aus
  `listDealerCredits` (keine zweite Berechnung); siehe KONVENTIONEN → Bonität.

### Bonitäts-Ampel aus der UI entfernt (Stand 1628347, 2026-07-16)
Die Kundin macht **keine Bonitätsprüfung**. Die Bewertungs-Ampel hat damit **keine
Anzeigestelle mehr**: Spalte „Bonität" aus der Händlerliste, Ampelpunkt aus dem
Kundendetail und Ampel/Begründung/„vor Warenzusage prüfen" aus `CreditHint`
entfernt; `CreditBadge` gelöscht. **`creditRating.ts` bleibt vollständig als
Faktenquelle** — offene/überfällige Beträge und Ø-Zahlungsverzug für die
Kundendetail-KPIs, den Kreditlimit-Kontext und das Dashboard (`getMoneySnapshot`).
`rateDealer` bleibt technisch vorhanden, aber ohne Verbraucher (siehe KONVENTIONEN
→ Bonität).

### Bewusst (noch) NICHT gebaut — und warum

Diese Lücken sind **Absicht, keine Vergessenheit**. Nicht nach Gefühl nachbauen —
erst die offene fachliche Frage mit der Kundin klären.

- **Prioritätsbasierte Zuteilung.** `dealer_season_priority` (Priorität je
  Händler/Saison) ist als Tabelle da und wird in [Dealers](src/pages/Dealers.tsx)
  gepflegt, hat aber **absichtlich noch keinen Verbraucher** in der Verteilung.
  Grund: Bei Warenknappheit ist die Verteil-Semantik bei der Kundin **offen** —
  strikt nach Priorität voll bedienen (höhere Prio zuerst, Rest geht leer aus) vs.
  anteilig kürzen, plus Behandlung von Gleichstand. Das sind verschiedene
  Algorithmen; das wird nicht geraten. Bis dahin: `generateDeliveries` befüllt mit
  den Bestellmengen und **warnt** nur bei Überschreitung; Theresa passt die
  Verteilung von Hand an. Die Fehlmengen-Warnung sagt das dem Nutzer auch explizit.
- **Liefertyp Kommission / Ansichtssendung.** Ein Lieferschein **ohne** Rechnung
  ist technisch möglich (`createDeliveryNote` ist unabhängig von `createInvoice`),
  aber es gibt **keinen Liefertyp** und keine Folgelogik (Kommission = Rechnung
  erst bei Verkauf). Grund: hängt an der **offenen Retouren-/Gutschriften-Klärung**
  (vgl. `deductions` in `commission_settlements`, aktuell immer 0). Erst wenn
  Retouren modelliert sind, ergibt der Liefertyp Sinn.

### Baustein C — Room with a View (viel später)
Schwesteragentur, Modevertrieb, ~15 Marken. Ablöse von GH Order (Deniba Wien).
Kommt erst, wenn A und B laufen.

## KONVENTIONEN (verbindlich — nicht neu erfinden)

Diese Regeln sind absichtlich zentral festgehalten, damit künftige Sitzungen sie
nicht neu herleiten müssen. Bei Abweichung: nachfragen, nicht danebenlegen.

### Fälligkeit / Überfälligkeit → nur `src/lib/dueDates.ts`
Es gibt **genau eine** Definition von Fälligkeit und Überfälligkeit, in
`src/lib/dueDates.ts` (`faelligkeitIso`, `isOverdue`, `daysOverdue`). Alle Ansichten
— Offene Posten, Bonitäts-Ampel, Dashboard, Mahnwesen — nutzen diese Funktionen.
**Keine zweite Definition irgendwo anders.** (Wir hatten drei divergierende
Rechenwege, das war ein Bug.) Regel: Fälligkeit = gespeichertes `due_date`
(eingefroren, verschiebt sich nicht rückwirkend); fehlt es, `invoice_date` +
Händler-`zahlungsziel_tage`, sonst `DEFAULT_ZAHLUNGSZIEL_TAGE` (30).

### Bonität → nur `src/lib/creditRating.ts`
**Die Bewertungs-Ampel hat seit 1628347 (2026-07-16) keine Anzeigestelle mehr** —
die Kundin macht keine Bonitätsprüfung (Details oben im Modulstand). `creditRating.ts`
bleibt aber die **einzige Quelle** für zwei getrennte Dinge, und diese Trennung ist
verbindlich:
- **Fakten (in Benutzung):** offene/überfällige Beträge und Ø-Zahlungsverzug je
  Händler (`listDealerCredits` → `DealerCredit`) und org-weit (`getMoneySnapshot`).
  Speist Kundendetail-KPIs, den Kreditlimit-Kontext in `CreditHint` und das
  Dashboard. Fälligkeit kommt aus `dueDates` (keine zweite Definition).
- **Bewertung (aktuell ohne Verbraucher):** `rateDealer` leitet die Ampel-Farbe
  **ausschließlich aus dem Zahlungsverhalten** ab (offene Überfälligkeit /
  Ø-Verzug gegen `CREDIT_THRESHOLDS`). Bleibt für eine evtl. spätere Nutzung
  stehen, wird aber nirgends mehr angezeigt.

Das **Kreditlimit (`dealers.credit_limit`) fließt bewusst NICHT in `rateDealer`
ein** — es ist reine Faktenanzeige in `CreditHint` („Offen: X von Y Kreditlimit").
Falls die Ampel je wieder gebraucht wird: erst mit Theresa klären, dann **zentral**
in `rateDealer` — **keine zweite Bonitäts-Logik daneben**.

### Snapshot-Muster für eingefrorene Werte
Konfigurationswerte, die sich ändern können, werden **beim Erzeugen eines Dokuments
eingefroren**, damit spätere Änderungen an der Konfiguration nichts rückwirkend
verfälschen:
- `commission_settlements.rate_percent` friert die Provisionsrate zum
  Abrechnungszeitpunkt ein (Quelle bleibt editierbar in `commission_settings`).
- `dunning_history.label_snapshot` / `fee_snapshot` frieren Bezeichnung und Gebühr
  der Mahnstufe zum Zeitpunkt des Setzens ein (Quelle bleibt `dunning_levels`).
- Analog: `invoices.due_date` als eingefrorene Fälligkeit (siehe oben).

Gegenbeispiel (bewusst NICHT eingefroren): die **erreichte Mahnstufe** einer offenen
Rechnung wird live aus (Tage überfällig) gegen die konfigurierten Schwellen
abgeleitet — eine geänderte Konfiguration wirkt so sofort auf die Übersicht.

### DB-Writes: Migrationen vorbereiten, NIE selbst anwenden
Schemaänderungen kommen als SQL-Datei nach `supabase/migrations/`
(`YYYYMMDDHHMMSS_name.sql`). **Claude Code wendet Migrationen NICHT an.** Der
SQL-Text geht an Jakob, der ihn im **Supabase SQL Editor** (Projekt
`wyddahfnxiilootylcwg`) einspielt. Migrationen sind **rein additiv und idempotent**
zu schreiben: nur `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS` / Seed-`INSERT … ON CONFLICT DO NOTHING`. Kein DROP,
kein RENAME, kein Typwechsel an bestehenden Spalten — die Echtdaten (128 Händler,
48 Artikel in Saison SS27) müssen gültig bleiben. Jede neue Tabelle bekommt `org_id` + dieselben
RLS-Policies wie der Rest (`org_id = auth_org_id()`).

### Rechenkerne supabase-frei halten (testbar unter `node --test`)
Reine Berechnungslogik gehört in ein **Modul ohne Supabase-Import**, damit sie
unter `node --test` (kein Vite, kein `import.meta.env`) importierbar ist —
`src/lib/supabase.ts` wirft schon beim Laden, wenn die `VITE_*`-Env fehlt. Muster:
die datenbeschaffende Funktion lädt und **delegiert** an den reinen Kern, der Kern
bekommt seine Eingaben als Argumente. Beispiele: `src/lib/itemKey.ts` (neutraler
Positions-Schlüssel), `src/lib/commissionCalc.ts` (Provisions-Rechenkern, u. a.
`agentGetsCommission` / `computeCommissionOverview`) mit `commissionCalc.test.ts`.

### Newsletter-Assets → Bucket `newsletter-assets`, nicht Mailchimp
Die konstanten Marken-Grafiken (Header-Headline, Showroom-Promo, Werte-Badges)
liegen als feste PNGs im **öffentlichen Supabase-Bucket `newsletter-assets`**
(einmalig aus dem Mailchimp-Konto rehostet). **Keine dauerhafte Verlinkung auf
`mcusercontent.com`.** Zugriff via `getPublicUrl` (`src/lib/newsletterAssets.ts`);
der Bucket ist `public=true`, weil das heruntergeladene Newsletter-HTML die Bilder
ohne Login in jedem Mail-Client laden muss (wie `crops`). Kein `.list()` auf den
Bucket. Hero-/Produktbilder kommen weiter aus dem `crops`-Bucket.

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
- Sidebar gruppiert Marketing- und Warenwirtschafts-Module (`navItems` / `warenItems`)

Die UI ist zweisprachig (DE/EN) über `src/i18n/`. **Kein Text hart im JSX** —
neue sichtbare Strings gehen als Keys in `src/i18n/dict.ts`.

## Multi-Tenant

`org_id` auf JEDER Tabelle, ab Tag 1. RLS auf jeder Tabelle
(`org_id = auth_org_id()`). Auch solange nur WARM ME als Mandant existiert.
Room with a View wird später als zweite Organisation hinzugefügt. `org_id` wird
app-seitig beim Insert gesetzt.

## Tech Stack

- **Frontend:** Vite + React + TypeScript, React Router (`react-router-dom`)
- **Styling:** Tailwind CSS
- **DB / Auth / Storage:** Supabase (Postgres, Frankfurt)
  - Projekt: wyddahfnxiilootylcwg
- **Bildverarbeitung:** Cropper.js (Zuschnitt im Browser)
- **PDF:** clientseitig (`src/lib/pdf.ts`), Ablage in Supabase Storage

## Regeln

- **Ein Modul pro Session.** Kein "bau die ganze App".
- **Plan Mode bei großen Änderungen.** Erst Plan, dann Code.
- **Migrations statt Klicken.** Schemaänderungen als SQL in `supabase/migrations/` —
  vorbereiten, nicht anwenden (siehe KONVENTIONEN → DB-Writes).
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
npm run lint       # oxlint
npm test           # node --test (u. a. dueDates, paymentTerms, tax, productMatch)
```
