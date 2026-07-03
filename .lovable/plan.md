# Curio — Museum Visit Receipt Generator

Anonymous single-page app to log a museum visit and export it as a thermal-receipt PNG. Matches the attached reference exactly: chunky stencil CURIO wordmark, monospace body on cream paper, zigzag top/bottom edges, dithered black-and-white images.

## Receipt visual spec (locked to reference)

- Paper: warm cream `#e8e4d8` with subtle grain, zigzag/perforated top and bottom edges (SVG mask).
- Width: 340px on screen, exported at 2x for a crisp PNG.
- Wordmark "CURIO": chunky pixel/stencil display face — **Rubik Puddles** or **Silkscreen** from Fontsource (final pick tested against the reference), ~56px, centered.
- Body: **IBM Plex Mono**, 13px, near-black `#171512`, tight line-height.
- Dividers: dashed `- - - -` rules and `********` asterisk rows exactly as shown.
- Images: rendered to canvas with a **Floyd–Steinberg dithered halftone** filter (pure JS, no wasm) — same look as the reference. 1 image = full width; 2 images = 2-col; 3+ = wrap. Each captioned `01`, `02`, … centered below.
- Copy preserved verbatim, including `THANK YOU FOR VISTING!` (typo intact per reference).

### Exact receipt structure

```
              CURIO                    ← stencil wordmark
   ******** www.curio.com ********
   MUSEUM:  <museum>
   DATE:    <DD-MON-YYYY H:MMPM>
   CURATOR: <visitor> (SESH #<nn>)
   - - - - - - - - - - - - - - - -
   QTY DESCRIPTION
   01 *<Title>* (<year>) - <Artist>
   * LINGER TIME                M:SS
   * MEDIUM              <MEDIUM CAPS>
   I WAS...        [chip] [chip]

   02 *<Title>* (<year>) - <Artist>
   …
   [dithered image grid, captioned 01 02 …]
   - - - - - - - - - - - - - - - -
   SUBTOTAL ITEM                    N
   TOTAL TIME SPENT           H:MM:SS
   ********************************
        THANK YOU FOR VISTING!
```

## User flow

1. **Start screen** (`/`) — CURIO wordmark, "Name" + "Museum visited" + optional "Year (for date shown on receipt)" inputs → creates visit → routes to builder.
2. **Builder** (`/visit/$visitId`) — split view: left = artwork form + list, right = live receipt preview.
   - **Add artwork form**: photo upload (`<input type="file" accept="image/*" capture="environment">` — camera roll on mobile, file picker on desktop), Title, Artist, Year, Medium, Linger time (mm:ss stepper, defaults 0:00 and can be started/stopped with a "Start timer" toggle while viewing), Emotion chips.
   - **Emotion chips**: curated preset row (Moved, Curious, Awed, Confused, Nostalgic, Amused, Unsettled, Peaceful, Inspired, Skeptical, Tender, Touched, In awe) — tap to toggle. `+ Add your own` text input appends custom chips. All chips render on the receipt as `[label]`.
   - Photo timestamp auto-extracted from EXIF `DateTimeOriginal` (via `exifr`); falls back to upload time.
   - Edit/delete per row.
3. **Download** — "Download receipt" button renders the receipt DOM to PNG (`html-to-image`, 2x pixel ratio). Filename: `curio-<museum-slug>-<date>.png`.

## Data model (Lovable Cloud)

Anonymous session id (uuid, `localStorage`, sent with every write).

```
visits
  id uuid pk
  session_id uuid
  visitor_name text
  museum text
  session_number int          -- SESH #NN, monotonic per session_id
  created_at timestamptz

artworks
  id uuid pk
  visit_id uuid fk
  session_id uuid             -- denormalized for policy checks
  position int                -- 01, 02, ...
  image_url text              -- public URL, storage bucket
  title text
  artist text
  year text
  medium text
  linger_seconds int
  emotions text[]             -- preset + custom, unified
  photo_taken_at timestamptz
  created_at timestamptz
```

Storage bucket `artwork-photos` (public read). Original photos are stored as-is; dithering happens client-side at render time so the stored file stays reusable.

RLS: all reads/writes go through server functions using a server publishable client. Policies restrict rows to matching `session_id` passed through the server fn. Service role is never bundled client-side.

## Routes

- `/` — start screen (public)
- `/visit/$visitId` — builder + preview (public; server fn verifies the caller's session id matches the visit's `session_id`; otherwise 404)

Both `head()` set real Curio title, description, og:title/description, twitter:card. Home ships no og:image; leaf visit route omits og:image (private link).

## Tech

- **Fonts**: `@fontsource/rubik-puddles` (or `@fontsource/silkscreen` — chosen after side-by-side check with the reference) + `@fontsource/ibm-plex-mono`. Loaded via `<link>` in `__root.tsx` head (Fontsource CSS import in `src/main.tsx`-equivalent entry). Registered in `@theme` as `--font-display` and `--font-mono`.
- **Dithering**: pure-JS Floyd–Steinberg on a canvas, 1-bit output; runs once per image and cached to a data URL. No wasm, Worker-safe.
- **EXIF**: `exifr` (browser).
- **PNG export**: `html-to-image` (`toPng`) at `pixelRatio: 2`. Web-fonts embedded via `fontEmbedCSS` so the export includes the stencil + mono glyphs.
- **State**: TanStack Query. Optimistic add on artwork insert.
- **Server fns** in `src/lib/visits.functions.ts` and `src/lib/artworks.functions.ts`: `createVisit`, `getVisit`, `addArtwork`, `updateArtwork`, `deleteArtwork`, `createSignedUpload`. Signed upload URLs are minted server-side so the service role stays server-only.

## Design shell (outside the receipt)

Same cream paper background as the receipt for the whole page. Form UI uses IBM Plex Mono at a smaller size, thin 1px borders, no shadows, uppercase field labels — the builder should feel like it's sitting on the same paper as the receipt.

## Build order

1. Enable Lovable Cloud.
2. Migration: `visits`, `artworks`, grants, RLS, `artwork-photos` bucket (public read).
3. Install `@fontsource/rubik-puddles`, `@fontsource/silkscreen`, `@fontsource/ibm-plex-mono`, `exifr`, `html-to-image`. Wire fonts and tokens in `styles.css`.
4. Server fns.
5. `/` start screen → creates visit → routes.
6. `/visit/$visitId` builder form + live receipt component (`<Receipt>`).
7. Floyd–Steinberg dither utility + integration in receipt images.
8. Zigzag perforation SVG masks + grain overlay.
9. PNG export & download.
10. Visual QA against the reference (side-by-side): wordmark, spacing, dashed rules, asterisk row count, chip formatting, dithered look.
11. Route metadata in `__root.tsx`.
