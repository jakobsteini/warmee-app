-- ============================================================================
-- 01 · WARM-ME-ORGANISATION sicherstellen
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent.
--
-- WARM ME ist aktuell der EINZIGE Mandant (siehe CLAUDE.md, Multi-Tenant).
-- In der Live-Datenbank EXISTIERT die Organisation bereits (die App läuft mit
-- ihr). Dann legt dieser Block NICHTS Neues an — er nutzt die bestehende Org,
-- und alle folgenden Blöcke referenzieren sie über:  (select id from organizations)
--
-- Nur in einer FRISCHEN/leeren DB wird die Organisation mit der folgenden
-- festen, dokumentierten UUID angelegt:
--
--     WARM-ME-org-id:  4a20bbb3-592e-49f4-bb70-d938deba0011
--
-- Bewusst NICHT hart in jeden INSERT geschrieben: Ein zweiter fester Wert würde,
-- falls die Org bereits unter einer anderen id existiert, eine DUPLIKAT-Org
-- anlegen und die Importe von den echten Daten abkoppeln. Deshalb Referenz über
-- (select id from organizations) — bei genau einem Mandanten eindeutig.
-- ============================================================================

-- Nur `id` referenzieren (sicher vorhanden). Falls die organizations-Tabelle
-- weitere NOT-NULL-Spalten ohne Default hat und die DB LEER ist, ergänze sie
-- hier — auf der Live-DB wird dieser INSERT ohnehin übersprungen.
insert into organizations (id)
select '4a20bbb3-592e-49f4-bb70-d938deba0011'::uuid
where not exists (select 1 from organizations);

-- GUARD: danach muss GENAU EINE Organisation existieren (sonst sichtbarer Abbruch).
do $$
declare n int;
begin
  select count(*) into n from organizations;
  raise notice 'organisationen: % (erwartet 1)', n;
  if n <> 1 then
    raise exception 'FEHLER: erwartet genau 1 Organisation (WARM ME), gefunden %. Bei mehreren Mandanten muss die WARM-ME-org-id in allen folgenden Bloecken fest referenziert werden.', n;
  end if;
end $$;

-- Zur Kontrolle:
select id as warm_me_org_id from organizations;
