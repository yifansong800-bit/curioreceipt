
-- Remove the permissive write policies. All writes go through server functions
-- using the service role, which validates session_id server-side.
DROP POLICY IF EXISTS "anon can insert visits" ON public.visits;
DROP POLICY IF EXISTS "anon can update visits" ON public.visits;
DROP POLICY IF EXISTS "anon can delete visits" ON public.visits;
DROP POLICY IF EXISTS "anon can insert artworks" ON public.artworks;
DROP POLICY IF EXISTS "anon can update artworks" ON public.artworks;
DROP POLICY IF EXISTS "anon can delete artworks" ON public.artworks;

-- Also revoke client write grants; keep read only.
REVOKE INSERT, UPDATE, DELETE ON public.visits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.artworks FROM anon, authenticated;
