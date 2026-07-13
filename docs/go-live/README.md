# WARM ME – Go-Live Runbook (echte Daten importieren)

Diese Anleitung importiert die echten WARM-ME-Daten in die Datenbank:
**128 Händler**, **48 Artikel (SS27)** und die **Nepal-Produktionsbestellung
FW26** (Produzent Shangri-La, 104 Positionen).

Du brauchst **kein Terminal und keine Technik-Kenntnisse**. Alles läuft im
**Supabase SQL Editor** per Copy-Paste.

---

## So funktioniert es

1. Supabase öffnen → Projekt **WARM ME** (`wyddahfnxiilootylcwg`) → links im Menü
   **SQL Editor** → **New query**.
2. Die Dateien in dieser Reihenfolge abarbeiten: **01 → 02 → 03 → 04 → 05 → 06
   → 07 → 08 → 09**.
3. Für jede Datei: **den kompletten Inhalt kopieren**, ins SQL-Editor-Fenster
   einfügen, **Run** klicken.
4. Unten erscheint das Ergebnis bzw. eine grüne Erfolgsmeldung. Erst wenn ein
   Block ohne Fehler durch ist, mit dem nächsten weitermachen.

> **Wichtig:** Immer nur **eine Datei nach der anderen**, in der Nummern-
> Reihenfolge. Jede Datei ist ein in sich geschlossener Block.
>
> **Doppelt ausführen ist ungefährlich.** Jeder Block ist so gebaut, dass ein
> versehentlicher zweiter Lauf nichts kaputt macht und keine Dubletten anlegt.
>
> **Fehler sind sichtbar.** Läuft etwas schief, bricht der Block mit einer roten
> Fehlermeldung ab (kein stilles Scheitern). Dann **stopp** und Bescheid geben —
> nicht den nächsten Block starten.

---

## Die Organisation (WARM ME)

Alle Daten gehören zur Organisation **WARM ME**. Sie existiert in der laufenden
Datenbank bereits; Block **01** stellt das nur sicher. Die feste WARM-ME-Org-ID
(nur relevant, falls die DB komplett leer wäre) lautet:

```
4a20bbb3-592e-49f4-bb70-d938deba0011
```

Alle folgenden Blöcke hängen die Daten automatisch an diese eine Organisation —
du musst die ID nirgends selbst eintippen.

---

## Reihenfolge & was jeder Block tut

| Datei | Was passiert | Erwartetes Ergebnis |
|---|---|---|
| **01_organization.sql** | WARM-ME-Organisation sicherstellen | genau **1** Organisation |
| **02_migration_realdata.sql** | Neue Spalten für Händler & Artikel (Kundennummer, Adressen, Preise, …) | „Success", keine Fehler |
| **03_migration_producers.sql** | Produzenten-Tabelle anlegen | „Success", keine Fehler |
| **04_migration_products_uniq.sql** | Eindeutigkeits-Index für Artikel | „Success", keine Fehler |
| **05_migration_poi_positions.sql** | Positions-Spalten für Bestellungen | „Success", keine Fehler |
| **06_dealers.sql** | **128 Händler** importieren | `dealers_warmme = 128` |
| **07_articles.sql** | Saison SS27 + **48 Artikel** importieren | `products_ss27 = 48` |
| **08_nepal.sql** | Shangri-La + Saison FW26 + Bestellung + **104 Positionen** | `nepal_items = 104` |
| **09_verify.sql** | Gesamt-Kontrolle (nur Anzeige, ändert nichts) | siehe unten |

**Warum diese Reihenfolge?** Zuerst die Organisation (01), dann die
Schema-Änderungen (02–05), die die neuen Spalten/Indizes anlegen, auf die die
Daten-Importe angewiesen sind. Danach die Daten: Händler (06), Artikel (07) —
und erst zuletzt die Nepal-Bestellung (08), weil sie ihre Artikel-Verknüpfung
gegen die zuvor importierten SS27-Artikel prüft.

---

## Abschluss-Kontrolle (Block 09)

Block **09_verify.sql** zeigt eine Tabelle mit `pruefung / ist / soll`. So soll
es aussehen:

| pruefung | ist | soll |
|---|---|---|
| organisationen | 1 | 1 |
| haendler (WARM ME) | 128 | 128 |
| artikel SS27 | 48 | 48 |
| produzent Shangri-La | 1 | 1 |
| produktionsbestellung FW26 | 1 | 1 |
| nepal-positionen | 104 | 104 |
| RLS aktiv — dealers | 1 | 1 |
| RLS aktiv — products | 1 | 1 |
| RLS aktiv — producers | 1 | 1 |
| RLS aktiv — production_order_items | 1 | 1 |

Wenn überall **ist = soll** steht, ist der Go-Live erfolgreich. Die
`RLS aktiv`-Zeilen mit `1` bestätigen, dass der Datenschutz (Row Level Security)
auf allen Tabellen aktiv ist.

> `ist` darf bei Händlern/Artikeln **größer** als `soll` sein, falls vorher schon
> Testdaten drin waren — kleiner niemals. Bei kleineren Zahlen: Import-Block
> erneut ausführen oder Bescheid geben.

---

## Hinweise

- **Was NICHT importiert wird:** Auftrags-Metadaten aus der Kundenliste
  (Bestelldatum/Bemerkung) — die gehören nicht zu den Stammdaten.
- **Fehlende Preise/UIDs:** Ein paar Artikel haben unvollständige Preise und
  einige Händler keine UID. Das ist bekannt und gewollt — sie werden trotzdem
  importiert und können später ergänzt werden.
- **Nepal-Artikelzuordnung:** Die meisten Nepal-Positionen haben absichtlich
  keine Artikel-Verknüpfung (FW26-Bestellung vs. SS27-Katalog). Das ist korrekt.
