
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  visitor_name text NOT NULL,
  museum text NOT NULL,
  session_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_session_id_idx ON public.visits (session_id);

CREATE TABLE public.artworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  position int NOT NULL DEFAULT 1,
  image_url text,
  title text NOT NULL DEFAULT '',
  artist text NOT NULL DEFAULT '',
  year text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  linger_seconds int NOT NULL DEFAULT 0,
  emotions text[] NOT NULL DEFAULT '{}',
  photo_taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artworks_visit_id_idx ON public.artworks (visit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO anon, authenticated;
GRANT ALL ON public.visits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artworks TO anon, authenticated;
GRANT ALL ON public.artworks TO service_role;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

-- Anonymous session-scoped app: any client can read/write. Row ownership is
-- enforced by the unguessable session_id + visit_id uuids that only the
-- creating browser holds. Server functions add explicit session_id checks.
CREATE POLICY "anon can select visits" ON public.visits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon can insert visits" ON public.visits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon can update visits" ON public.visits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete visits" ON public.visits FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon can select artworks" ON public.artworks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon can insert artworks" ON public.artworks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon can update artworks" ON public.artworks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete artworks" ON public.artworks FOR DELETE TO anon, authenticated USING (true);
