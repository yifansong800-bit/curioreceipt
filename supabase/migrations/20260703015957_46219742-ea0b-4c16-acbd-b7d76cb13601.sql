
CREATE POLICY "anon upload to artwork-photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'artwork-photos');
CREATE POLICY "anon read artwork-photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artwork-photos');
