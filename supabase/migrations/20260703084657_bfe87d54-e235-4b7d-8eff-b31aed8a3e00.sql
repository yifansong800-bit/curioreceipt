
-- Lock down public read on visits/artworks; all reads go through server functions (service role bypasses RLS).
DROP POLICY IF EXISTS "anon can select artworks" ON public.artworks;
DROP POLICY IF EXISTS "anon can select visits" ON public.visits;

-- Revoke direct anon/authenticated privileges (server functions use service_role).
REVOKE ALL ON public.artworks FROM anon, authenticated;
REVOKE ALL ON public.visits FROM anon, authenticated;
GRANT ALL ON public.artworks TO service_role;
GRANT ALL ON public.visits TO service_role;

-- Storage: remove open anon read/write on artwork-photos. Uploads now go through a server function using service role; reads use signed URLs.
DROP POLICY IF EXISTS "anon upload to artwork-photos" ON storage.objects;
DROP POLICY IF EXISTS "anon read artwork-photos" ON storage.objects;
