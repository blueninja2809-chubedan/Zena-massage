-- Public URLs for partner signup photos (admin panel loads these in the browser).
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-applications', 'partner-applications', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "partner_applications_storage_select" ON storage.objects;
CREATE POLICY "partner_applications_storage_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'partner-applications');

DROP POLICY IF EXISTS "partner_applications_storage_insert" ON storage.objects;
CREATE POLICY "partner_applications_storage_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'partner-applications');

DROP POLICY IF EXISTS "partner_applications_storage_update" ON storage.objects;
CREATE POLICY "partner_applications_storage_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'partner-applications')
WITH CHECK (bucket_id = 'partner-applications');

DROP POLICY IF EXISTS "partner_applications_storage_delete" ON storage.objects;
CREATE POLICY "partner_applications_storage_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'partner-applications');
