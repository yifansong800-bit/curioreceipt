ALTER TABLE public.artworks ALTER COLUMN rating TYPE numeric(2,1) USING rating::numeric;
ALTER TABLE public.artworks ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';