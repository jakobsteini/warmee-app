-- ============================================================================
-- NEWSLETTER im WARM-ME-Vorlagendesign (redaktioneller Text + Akzentfarbe +
-- Bucket für die konstanten Marken-Grafiken)
-- Quelle: echte Mailchimp-Vorlagen (CHOCOLATE/BLUE/BROWN) — ein Layout,
-- konstante Marken-Blöcke, nur Bild-Content + eine Akzent-/Bandfarbe variieren.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: Tabelle newsletters, organizations
-- sowie auth_org_id() bestehen bereits.
--
-- REIN ADDITIV: nur ADD COLUMN IF NOT EXISTS + Bucket-Insert + Storage-Policies.
-- Kein DROP/RENAME/Typwechsel an bestehenden Spalten. Idempotent (Policies über
-- drop-if-exists guard, damit ein erneuter Lauf nicht bricht).
-- ============================================================================


-- ─── (a) Redaktionelle Textfelder + Akzentfarbe je Newsletter ───────────────
-- body_headline/body_text: der pro Aussendung variierende Intro-Text (in den
-- Vorlagen mal als Text, mal als handgeschriebene Grafik — bei uns als Text).
-- link_label/link_url: der optionale „Mehr…"-Link. accent_color: die einzige
-- Chrome-Farbe, die je Kampagne variiert (freier Farbwert, Default Taupe).
alter table newsletters
  add column if not exists body_headline text,
  add column if not exists body_text     text,
  add column if not exists link_label    text,
  add column if not exists link_url      text,
  add column if not exists accent_color  text not null default '#a08d79';


-- ─── (b) Öffentlicher Bucket für die konstanten Marken-Grafiken ─────────────
-- Header-Headline, Showroom-Promo und die drei Werte-Badges sind in allen
-- Vorlagen identisch → sie gehören ins Template, nicht in Eingabefelder. Sie
-- liegen als feste PNGs in diesem Bucket (einmalig aus WARM MEs Mailchimp-Konto
-- rehostet — KEINE dauerhafte Verlinkung auf mcusercontent.com).
--
-- public = true: das heruntergeladene Newsletter-HTML muss die Grafiken ohne
-- Anmeldung in jedem Browser/Mail-Client laden können (wie der crops-Bucket).
-- Multi-Tenant-Hinweis: Es sind WARM-ME-Markengrafiken. Eine spätere zweite
-- Organisation (Room with a View) bekäme eigene Dateinamen/Unterordner; der
-- Bucket selbst bleibt geteilt und public-read.
insert into storage.buckets (id, name, public)
values ('newsletter-assets', 'newsletter-assets', true)
on conflict (id) do nothing;

-- Public-Read (jeder mit URL – nötig für standalone HTML/E-Mail).
drop policy if exists "newsletter_assets_public_read" on storage.objects;
create policy "newsletter_assets_public_read" on storage.objects for select
  using (bucket_id = 'newsletter-assets');

-- Schreiben/Ändern nur für angemeldete Nutzer (Marken-Asset-Pflege durch Team),
-- nie anonym. Kein Deaktivieren von RLS.
drop policy if exists "newsletter_assets_auth_insert" on storage.objects;
create policy "newsletter_assets_auth_insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'newsletter-assets');

drop policy if exists "newsletter_assets_auth_update" on storage.objects;
create policy "newsletter_assets_auth_update" on storage.objects for update
  to authenticated using (bucket_id = 'newsletter-assets');
