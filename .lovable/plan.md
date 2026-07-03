## Change

Replace the thumbnail-on-the-left layout of the entry rows in the composer with a full-width row whose background is a soft, blurred gradient sampled from the uploaded artwork's dominant colors.

## Implementation

**1. Extract dominant colors on upload** (`src/routes/visit.$visitId.tsx` add-artwork handler)
- After the image is read for EXIF/preview, sample it on a tiny offscreen canvas (e.g. 32×32) and pick 2–3 dominant colors via a simple bucketed frequency count (no new dependency).
- Store the resulting palette (array of `rgb()` strings) alongside the artwork in local state so the row can render immediately. Persist it as part of the artwork record (new optional `palette: string[]` column on `artworks`, nullable) so it survives reloads.

**2. Migration**
- Add `palette text[]` (nullable) to `public.artworks`. No RLS/grant changes needed.
- Update `artworks.functions.ts` create/list to pass through `palette`.

**3. Row component** (`src/components/artwork-card.tsx`)
- Remove the `<img>` thumbnail.
- Root row becomes `relative overflow-hidden` with:
  - a background layer: `linear-gradient(135deg, c1, c2, c3)` using the palette, `filter: blur(24px)` and `opacity: 0.55`, scaled slightly (`scale(1.15)`) so blur edges don't show.
  - a subtle paper-tinted overlay (`bg-[--paper]/55`) so IBM Plex Mono text stays readable on any palette.
- Text content (`01 Gun — Liu Ye`, `0:00 · Oil o Canvas`, `remove`) stays in the same monospace styling; just no image column, full-width padding.
- Fallback when palette is missing: keep current neutral border only (no background).

**4. No changes to**
- The printed receipt itself (still shows dithered images).
- Emotion chips, EXIF, upload logic, printer stage.

## Technical notes

- Color sampling uses `<canvas>` `getImageData` on a downscaled draw of the uploaded File via `createImageBitmap`; runs client-side once at add-time. Quantize each channel to 5 bits, count buckets, take top 3, skip near-white/near-black to avoid muddy gradients.
- Palette persistence is best-effort — if the DB write fails to include it (older row), the row simply renders without the blurred background.