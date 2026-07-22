-- ============================================================================
-- Storage-Bucket "dealer-image-zips" (PRIVAT) für den Händler-Bildversand (S-B).
--
-- Beim Mailversand wird das Bildmaterial eines Händlers zu EINER ZIP gepackt,
-- hier abgelegt (Pfad org_id/dealer_id/…) und per zeitlich begrenzter Signed-URL
-- im Mail-Body VERLINKT. So wird Resends Anhang-Größenlimit umgangen; der Händler
-- lädt ohne Login über die Signed-URL (der Token in der URL umgeht die RLS).
--
-- REIN ADDITIV / IDEMPOTENT: Bucket per ON CONFLICT DO NOTHING, Policies per
-- DROP IF EXISTS + CREATE (wie belege-archiv). Kein DROP/RENAME an Bestandsdaten.
-- Objekt-Policies scopen auf die eigene Org (erstes Pfad-Segment = org_id).
--
-- NICHT AUTOMATISCH ANWENDEN. Im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- einspielen. Danach die Edge Function neu deployen (send-beleg-mail).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('dealer-image-zips', 'dealer-image-zips', false)
on conflict (id) do nothing;

-- select: eigene Org lesen (nötig, damit die Signed-URL erzeugt werden kann).
drop policy if exists "dealer_image_zips_obj_select" on storage.objects;
create policy "dealer_image_zips_obj_select" on storage.objects for select
  using (bucket_id = 'dealer-image-zips' and (storage.foldername(name))[1] = auth_org_id()::text);

-- insert: die ZIP in die eigene Org ablegen.
drop policy if exists "dealer_image_zips_obj_insert" on storage.objects;
create policy "dealer_image_zips_obj_insert" on storage.objects for insert
  with check (bucket_id = 'dealer-image-zips' and (storage.foldername(name))[1] = auth_org_id()::text);

-- delete: eigene Org aufräumen (für späteres Löschen abgelaufener ZIPs).
drop policy if exists "dealer_image_zips_obj_delete" on storage.objects;
create policy "dealer_image_zips_obj_delete" on storage.objects for delete
  using (bucket_id = 'dealer-image-zips' and (storage.foldername(name))[1] = auth_org_id()::text);
