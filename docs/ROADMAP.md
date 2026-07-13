# WARM ME — Roadmap & Anforderungs-Triage

**Stand:** 2026-07-13 · **Grundlage:** `WarmME_Systemanforderungen_v1.docx` (Verena, 16 Punkte)
**Zweck:** Jeder der 16 Lastenheft-Punkte wird gegen den bereits gebauten, live
laufenden Code gehalten und in eine Umsetzungs-Roadmap überführt.

> **Hinweis zum Lastenheft:** Das Dokument lag **nicht** im Repo, sondern unter
> `~/Downloads/WarmME_Systemanforderungen_v1.docx`. Es sollte für die
> Nachvollziehbarkeit noch nach `docs/anforderungen/` ins Repo übernommen werden
> (separater Schritt — hier wurde nur diese Roadmap erstellt).

## Ausgangslage (live, mit Echtdaten)

- **Baustein B (Marketing):** Händlerliste, Bildarchiv, Zuschnitt-Editor, Newsletter-Generator.
- **Baustein A (Warenwirtschaft):** Artikelkatalog, Ordererfassung, Produktionsbestellung
  (generalisiert auf mehrere Produzenten), Wareneingang/Verteilung, Lieferschein & Rechnung
  (PDF, 20 % USt, Skonto 3 %/10T netto 30), Offene Posten, Dashboard.
- **Multi-Tenant:** `org_id` + RLS auf allen Tabellen.
- **Importiert & verifiziert:** 128 Händler, 48 Artikel (SS27), Produzent Shangri-La,
  1 Produktionsbestellung FW26 mit 104 Positionen.

## Legende

| Kategorie | Bedeutung |
|---|---|
| 🟢 **SCHON DA** | Ganz oder überwiegend implementiert. Relevante Datei benannt. |
| 🟡 **KLEINE ERGÄNZUNG** | Fundament steht, es fehlt ein überschaubares Stück. |
| 🔴 **ECHTES MODUL** | Größerer eigener Baustein, noch nicht vorhanden. |

> **Konvention:** Jeder Punkt bekommt **eine** primäre Kategorie. Enthält ein Punkt
> zusätzlich ein klar abtrennbares großes Teilstück, wird das als eigenes
> (Teil-)Modul ausgewiesen und in der Reihenfolge einsortiert.

---

## Triage der 16 Punkte

### 1. Artikelanlage — 🟡 KLEINE ERGÄNZUNG
**Fundament:** `products` mit **drei Preisebenen** (`retail_price` = VK B2C,
`wholesale_price` = VK Handel, `purchase_price` = EK Produzent), `season_id`,
`category`, `color[]`, plus Stammdaten (`style`, `composition`, `gauge`, …).
`producers`-Tabelle vorhanden. 48 Artikel SS27 importiert.
Dateien: `src/pages/Products.tsx`, `src/lib/products.ts`, `src/types/product.ts`, `src/lib/producers.ts`.
**Es fehlt:**
- **Bildmaterial je Farboption** (Farbe → Asset-Verknüpfung) — aktuell nur `color[]` als Textliste.
- **Lieferantenzuteilung + Produktgruppe direkt am Artikel** (`producer_id` + `product_group` auf `products`); Gruppen existieren bisher nur als Freitext `group_name` auf der Produktionsposition.
- Saubere Trennung der **4. Preisebene** (Großhandels-EK vs. VK Handel) und expliziter **Preisverlauf** über Saisonen (heute implizit über season-scoped Produktzeilen).

### 2. Auftragseingabe (Kundenorder) — 🟡 KLEINE ERGÄNZUNG (Kern) + 2 ausgegliederte 🔴 Teilmodule
**Fundament:** Vollständige interne Ordererfassung. `orders`/`order_items`,
Status **Entwurf → Eingereicht → Bestätigt** (= die im Lastenheft geforderte
Freigabe durch Warm ME), Saison/Artikel/Farbe/Größe/Menge/Summe.
Dateien: `src/pages/OrderEdit.tsx`, `src/lib/orders.ts`, `src/types/order.ts`.
**Kleine Lücken (Pflichtfelder 2.2):** **Lieferdatum (Ab-soll)** auf der Order,
**Kundenrabatt** (individuell je Kunde), **Zuteilung Warm ME / Agentin** auf Order-Ebene.
**Ausgegliederte echte Teilmodule:**
- **2.3 Priorisierungslogik** (Priorität je Kunde/Saison, gesteuerte Warenverteilung bei Unterdeckung) → speist Punkt 4.
- **2.4 Bonitäts-Popup** (offene Rechnungen / Zahlungsmoral / OP-Liste beim Erfassen) → braucht Zahlungshistorie aus Punkt 8.1.
- **2.5 Automatische Auftragsbestätigung** (AB mit Artikel-/Farbbildern, Mengen, Lieferdatum, AGB-Anhang, Versand) → braucht E-Mail-Versand (Querschnitts-Enabler).

### 3. Produzentenorder — 🟡 KLEINE ERGÄNZUNG
**Fundament (stark):** `generateProductionOrder(seasonId, producerId)` **aggregiert
automatisch aus allen bestätigten Kundenorders** einer Saison nach Produkt+Farbe+Größe.
Mehrere Produzenten parallel möglich. Übersicht/Detail vorhanden; FW26 mit 104 Positionen live.
Dateien: `src/lib/productionOrders.ts`, `src/pages/ProductionOrders.tsx`, `src/pages/ProductionOrderEdit.tsx`.
**Es fehlt:**
- **Aufteilung nach Produzent UND Produktgruppe** — aktuell wird eine PO als Ganzes einem Produzenten zugeordnet, keine automatische Gruppen-/Produzenten-Splittung.
- **Rückverfolgung**, welche Kundenorders hinter jeder Produzentenposition stecken (Verknüpfungs-Tabelle Position ↔ Order-Items).
- **Dokument-Export/Versand** der PO (kein PDF für Produktionsbestellungen; `pdf.ts` kann nur Rechnung + Lieferschein).

### 4. Wareneingang & Warenverteilung — 🟢 SCHON DA (überwiegend)
**Vorhanden:** `generateDeliveries()` verteilt eine erhaltene PO automatisch auf die
bestätigten Kundenorders, **Soll/Ist-Abgleich** (`DeliveryComparisonRow`,
`orderedQuantities`), editierbare Teillieferung, Status-Flow, Kommissionierschein
als Lieferung + Lieferschein-PDF.
Dateien: `src/lib/deliveries.ts`, `src/pages/Deliveries.tsx`, `src/pages/DeliveryEdit.tsx`.
**Einzige Lücke:** Verteilung startet 1:1 mit der bestellten Menge; die **Priorisierungslogik
bei Unterdeckung** (nicht alle Orders voll belieferbar) fehlt noch — hängt an Punkt 2.3.

### 5. Lieferschein & Rechnungserstellung — 🟢 SCHON DA (Belegkern) + 🟡 Ergänzung Versand
**Vorhanden:** `createDeliveryNote()` (nur Lieferschein, ohne Preise — für Kommission/
Ansicht), `createInvoice()` (Lieferschein + Rechnung in einem Schritt, 20 % USt, Skonto,
Nummernkreise, Storno), Positionen vor Erstellung editierbar (Delivery-Items). PDFs im
privaten Storage-Bucket mit Signed-URL.
Dateien: `src/lib/invoices.ts`, `src/pages/InvoiceEdit.tsx`, `src/lib/pdf.ts`, `src/pages/DeliveryEdit.tsx`.
**Es fehlt (Versand-Teil):** **mehrere E-Mail-Adressen je Zuständigkeit** (AB/Rechnung/Lager),
**Versand der Belege per E-Mail** und **Trackingnummer + Versanddienstleister** im Mail
— hängt am E-Mail-Versand-Enabler.

### 6. Kommissionslieferungen & Musterkollektion — 🔴 ECHTES MODUL
Der reine „nur Lieferschein"-Fall existiert technisch (`createDeliveryNote`), aber:
- **6.1** Kein Kommissions-**Tracking** (was kommt zurück / was behält der Kunde) und keine **Rechnung aus behaltener Ware**.
- **6.2 Musterkollektion** komplett fehlend: eigene Lagerkategorie getrennt vom Verkaufsbestand, Versand an Agentin mit eigenem Lieferschein, Rückgabe-Erfassung, separater Bestandsausweis.

### 7. Freie Rechnungserstellung — 🟡 KLEINE ERGÄNZUNG
`createInvoice()` verlangt zwingend eine `deliveryId`. Die Rechnungs-Infrastruktur ist
aber komplett da — `invoice_items.product_id` ist **NULLABLE** mit freiem `description`,
Nummernkreis/PDF/USt stehen. Es fehlt nur ein **„freie Rechnung"-Formular** +
`createFreeInvoice()` (ohne Order/Lieferung, für Gebühren/interne Verrechnung).
Datei: `src/lib/invoices.ts`, `src/pages/InvoiceEdit.tsx`.

### 8. Zahlungseingang & Mahnwesen — 🔴 ECHTES MODUL (mit kleiner Vorstufe)
- **8.1 Zahlungseingang** (🟡 Vorstufe): Heute nur Status-Toggle `sent → paid`, **kein
  Zahlungsdatum/-betrag/Teilzahlung** erfasst. Braucht `payments`-Tabelle (Datum, Betrag je
  Rechnung). Offene Posten (`OpenPayments.tsx`, `src/lib/openPayments.ts`) existiert bereits.
  Bankanbindung + Tagesabschluss = laut Lastenheft Zukunft.
- **8.2 Mahnwesen** (🔴): konfigurierbare Mahnstufen, automatische Benachrichtigung bei
  Zielüberschreitung, Mahnung aus dem System versenden — komplett fehlend, hängt am
  E-Mail-Versand-Enabler.

### 9. Retouren & Reklamationen — 🔴 ECHTES MODUL
Nichts vorhanden. Erfassung von Reklamationen, Status „offen", **Gutschrift aus Reklamation**,
Einfluss auf den tatsächlich verrechneten Betrag → direkt gekoppelt an die Provisionsbasis (Punkt 10).

### 10. Provisionsabrechnung — 🔴 ECHTES MODUL
Nichts vorhanden. Hinterlegbare/änderbare **Provisionsrate**, Zuteilung Order → Agentin/intern,
Provision auf den **tatsächlich eingegangenen** Rechnungsbetrag (nach Retouren/Gutschriften/
nicht gelieferten Positionen), Abrechnungsdokument, **Vorabprovision je Saison**.
Kern-Geschäftswert für den Agentin-/D-CH-Vertrieb.

### 11. Lagerverwaltung — 🔴 ECHTES MODUL
Kein Bestandsmodell — die App bildet heute nur den **Fluss** ab (Order → PO → Wareneingang →
Rechnung), keinen Bestand („stock on hand"). Es fehlt: Echtzeit-Bestand nach Zu-/Abgang,
separater Bereich für die Musterkollektion, Shopify-Sync (= Zukunft). Datenquellen für Zu-/
Abgänge (Wareneingang, Lieferung/Rechnung) sind vorhanden.

### 12. Kundenverwaltung — 🟡 KLEINE ERGÄNZUNG
**Fundament (sehr reich, aber teils ungenutzt im UI):** `dealers` enthält bereits Rechnungs-/
Liefer-/Store-Adressen, `uid`, `kundennummer`, `payment_terms_raw`, `skonto_*`,
`zahlungsziel_tage` und mehrere E-Mail-Felder. 128 Händler importiert.
**Aber:** Das Bearbeitungsformular (`DealerInput` / `src/pages/Dealers.tsx`) deckt nur
`name/contact/email/city/country` ab — die reichen Importfelder sind **nicht editierbar**.
**Es fehlt:** editierbares CRM-UI für die vorhandenen Felder + **E-Mail-Zuständigkeitsrollen**
(AB/Rechnung/Lager) strukturiert, **individueller Rabatt**, **Priorität je Saison**,
**Bonität/Zahlungshistorie**, **Kreditlimit**, **Dokumentenablage**, B2C-Gruppe,
DSGVO-Löschfunktion. (Dokumentenablage grenzt an ein eigenes kleines Modul.)

### 13. Benutzerverwaltung & Zugriffsrechte — 🔴 ECHTES MODUL
Heute nur org-scoped RLS (`auth_org_id()`), **keine Rollen** (keine `role`-Spalte, kein
View-only-Agentin, kein Saison-Scope). `dealers.agent_id` ist reines Datenfundament.
Gefordert: Agentin nur aktive Saison, kein Rechnungs-/Finanzzugriff, Order mit Freigabe;
granulare Rechte. Voraussetzung für den echten Agentin-Login (laut Lastenheft „zukünftige
Erweiterung", daher aufschiebbar).

### 14. Auswertungen & Berichte — 🔴 ECHTES MODUL
Heute: Dashboard mit 4 Kennzahlen (`src/lib/dashboard.ts`) + Offene Postenliste (🟢 da).
Es fehlt der Reporting-Baustein: **Umsatz nach Saison/Produzent/Produktgruppe/Kunde/Agentin**,
Provisionsübersicht, **Zahlungsmoral je Kunde**, Lagerbestandsberichte, Tagesabschluss.
Der reine Umsatz-Report ist auf Bestandsdaten sofort machbar; Rest hängt an 8/10/11.

### 15. Export & Dokumentenmanagement — 🟡 KLEINE ERGÄNZUNG
Rechnungen/Lieferscheine als PDF exportierbar ✓ (Storage + Signed-URLs, `signedPdfUrl`).
Es fehlt: **Sammel-/Steuerberater-Export** (Bulk-Download aller Belege) und **Archiv-Sicht
vergangener Saisonen** (gesetzlich 7 Jahre). Fundament (PDFs im Bucket) steht → nur Export-
Funktion + Saison-Filter. Datei: `src/lib/invoices.ts`.

### 16. Technische & Allgemeine Anforderungen — 🟡 KLEINE ERGÄNZUNG
**DSGVO-konform** ✓ (RLS, `org_id` überall, private Buckets, AVV existiert). Mobile/Tablet,
Shopify-Sync, Bankanbindung = laut Lastenheft **Zukunft**. Einziger nicht-„Zukunft"-Punkt:
**Zweisprachigkeit DE/EN** — aktuell nur deutsche UI, keine i18n-Infrastruktur; zieht sich
quer durch die App (eher M als S).

---

## Übersicht

| # | Punkt | Kategorie | Größe (nur echte Module) |
|---|---|---|---|
| 1 | Artikelanlage | 🟡 kleine Ergänzung | — |
| 2 | Auftragseingabe | 🟡 Kern + 🔴 2.3/2.4/2.5 | Teilmodule je S–M |
| 3 | Produzentenorder | 🟡 kleine Ergänzung | — |
| 4 | Wareneingang & Verteilung | 🟢 schon da | — |
| 5 | Lieferschein & Rechnung | 🟢 schon da (+🟡 Versand) | — |
| 6 | Kommission & Muster | 🔴 echtes Modul | **M** |
| 7 | Freie Rechnung | 🟡 kleine Ergänzung | — |
| 8 | Zahlungseingang & Mahnwesen | 🔴 (8.1 🟡 / 8.2 🔴) | 8.1 **S**, 8.2 **M** |
| 9 | Retouren & Reklamationen | 🔴 echtes Modul | **M** |
| 10 | Provisionsabrechnung | 🔴 echtes Modul | **L** |
| 11 | Lagerverwaltung | 🔴 echtes Modul | **L** |
| 12 | Kundenverwaltung | 🟡 kleine Ergänzung | — |
| 13 | Benutzer & Rechte | 🔴 echtes Modul | **M** |
| 14 | Auswertungen | 🔴 echtes Modul | **M** |
| 15 | Export & Dokumente | 🟡 kleine Ergänzung | — |
| 16 | Technisch/Allgemein (i18n) | 🟡 kleine Ergänzung | (i18n eher M) |

**Zählung:** 🟢 2 · 🟡 7 · 🔴 7.

## Echte Module — Größe & Abhängigkeiten

| Modul | Größe | Muss vorher stehen |
|---|---|---|
| 2.3 Priorisierung | S | Priorität-Feld je Kunde/Saison (→ 12) |
| 2.4 Bonitäts-Popup | S | Zahlungshistorie (8.1), OP (da) |
| 2.5 Auto-AB | M | E-Mail-Versand-Enabler, Farb-Bildmaterial (1) |
| 6 Kommission & Muster | M | Lager (11) für Musterbestand; Rechnung (da) |
| 8.1 Zahlungseingang | S | — (OP schon da) |
| 8.2 Mahnwesen | M | E-Mail-Versand-Enabler; OP (da) |
| 9 Retouren/Reklamationen | M | Rechnung (da); koppelt an Provision (10) |
| 10 Provisionsabrechnung | L | Agentin-Zuteilung (2), Zahlungseingang (8.1), Retouren (9) |
| 11 Lagerverwaltung | L | Wareneingang (4) + Rechnung (5) — beide da |
| 13 Benutzer & Rechte | M | keine harten; berührt RLS überall |
| 14 Auswertungen | M | 8/10/11 für Vollständigkeit; Umsatz-Report sofort |

### Querschnitts-Enabler (in keinem der 16 Punkte als eigener Baustein, aber Voraussetzung für mehrere)
- **E-Mail-Versand-Infrastruktur** (SMTP/Edge Function) — heute gibt es **keinen** Mailversand. Blockiert 2.5 (AB), 5 (Belegversand + Tracking), 8.2 (Mahnungen). Sinnvoll, einmal zentral zu bauen.
- **i18n DE/EN** (Punkt 16) — Querschnitt durch die gesamte UI.

---

## Empfohlene Reihenfolge der nächsten Bausteine

Priorisiert nach **Abhängigkeit + Geschäftswert**, nicht nach Bequemlichkeit. Leitgedanke:
Das Live-System bildet die Kette *Order → Bestätigung → Produzentenorder → Wareneingang →
Rechnung* bereits ab. Als Nächstes wird diese Kette **Lastenheft-konform und
finanzverlässlich** gemacht, dann das umsatzkritische **Agentin-/Provisions**-Thema
erschlossen, danach ausgewertet.

### Baustein 1 — Kundenstamm & Order-Vervollständigung  *(bündelt 🟡 12 + 🟡 2-Kern)*
CRM-UI für die bereits importierten `dealers`-Felder editierbar machen (Rabatt, Zahlungsziel,
E-Mail-Zuständigkeiten, **Priorität je Saison**) **und** die Order-Pflichtfelder ergänzen
(**Lieferdatum**, **Rabatt-Übernahme**, **Zuteilung Warm ME/Agentin**).
**Warum zuerst:** reines Aufräumen auf vorhandenen Echtdaten, keine neue Infrastruktur,
macht das Live-System sofort lastenheftkonform. Rabatt, Priorität und Agentin-Zuteilung sind
**Voraussetzung für fast alles danach** (Verteilungs-Priorisierung 2.3/4, Provision 10,
Bonität 2.4). Höchster Hebel pro Aufwand. **Größe: S–M.**

### Baustein 2 — Zahlungseingang & Beleg-Vervollständigung  *(🔴 8.1 + 🟡 7 + 🟡 15)*
Strukturierte **Zahlungserfassung** (`payments`: Datum/Betrag/Teilzahlung je Rechnung),
**freie Rechnung** und **Steuerberater-Bulk-Export**.
**Warum:** schließt den Geld-Kreis (heute nur `paid`-Toggle) und erzeugt die
**Zahlungshistorie/Zahlungsmoral**, die Bonität (2.4), Provision (10) und Auswertungen (14)
erst ermöglichen. Freie Rechnung + Export sind billige, häufig gebrauchte Zusatzbelege.
**Größe: M.**

### Baustein 3 — Provisionsabrechnung  *(🔴 10, jetzt entsperrt)*
Provisionsrate hinterlegbar/änderbar, Berechnung auf den **tatsächlich eingegangenen**
Rechnungsbetrag, **Vorabprovision je Saison**, Abrechnungsdokument. Möglich, weil
Agentin-Zuteilung (B1) und Zahlungseingang (B2) dann stehen.
**Warum hier:** direkt umsatzrelevant für die D/CH-Expansion über die Agentin — das
zentrale Wachstumsthema des Lastenhefts. *Nachzug 3b:* Retouren/Gutschriften (9) verfeinern
die Provisionsbasis und können unmittelbar danach ergänzt werden. **Größe: L.**

### Baustein 4 — Auswertungen & Berichte  *(🔴 14 + 🟡 2.4)*
Umsatz nach Saison/Produzent/Produktgruppe/Kunde/Agentin, **Provisionsübersicht**,
**Zahlungsmoral je Kunde**. Hier andocken lässt sich das **Bonitäts-Popup (2.4)**, da es
dieselben Kennzahlen (offene Rechnungen, Zahlungsmoral) braucht.
**Warum zuletzt im Top-4-Block:** die Datenquellen (Zahlungen B2, Provision B3) stehen erst
jetzt — vorher wären die Reports halb leer. **Größe: M.**

### Danach (nicht Top-4, kurz eingeordnet)
- **E-Mail-Versand-Enabler** → zieht Auto-AB (2.5), Belegversand + Tracking (5) und **Mahnwesen (8.2)** mit.
- **Lagerverwaltung (11, L)** — relativ eigenständig, aber nicht blockierend für die Geldkette.
- **Kommission & Muster (6, M)** — sinnvoll nach dem Lager (Musterbestand).
- **Benutzer & Rechte (13, M)** — spätestens **bevor** die Agentin real eingeloggt wird.
- **i18n DE/EN (16)** und die Artikel-Ergänzungen (Farb-Bildmaterial, Produzent/Gruppe am Artikel, Punkt 1) laufend/parallel.
