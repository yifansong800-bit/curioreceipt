## Goal

Rebuild Curio's look and flow to match the five uploaded designs exactly, while keeping every existing execution intact: artwork identification, receipt rendering, dither/color ink, crop editor, proof sheet, the print animation, and export.

---

## 1. Color system + assets

New palette tokens in `src/styles.css` (replacing the current cream/ink scheme):

- Cream `#EDEAE4` (the homepage background from the design)
- Ochre `#BE5103`, Yellow `#FFCE1B`, Teal `#069494`, Rust `#B7410E`
- Ink stays near-black; receipt paper and printed receipts use the new cream`#EDEAE4 color.`

Per-page background is set by mode: homepage cream, SNAP ochre, LOG yellow, SHARE/print teal.

Assets cropped from the uploads and pushed to CDN as `.asset.json` pointers:

- The doodle blob figure (homepage)
- The three pixel marks: SNAP `+`, LOG `■`, SHARE `⠿` dot-grid
- The flat printer housing (from the share/print design), replacing `printer.png`

The CURIO wordmark is still the same google font as now. No need to crop from upload.

---

## 2. Homepage (`src/routes/index.tsx`)

Complete rewrite to the sketch:

- Cream background, wordmark, tagline "A thermal receipt for your art museum visit."
- Doodle blob containing the three icons with `SNAP / LOG / SHARE` captions
- Yellow-on-teal `BEGIN` button
- Info button stays top-right (About dialog + privacy link unchanged)
- No name/museum inputs here anymore

Tapping any icon opens a card-style pop up (like the info pop up) **animated demo preview** replicating that upload:

- SNAP: ochre bg, sketch photo frame, "SNAP THE ART IN FRONT OF YOU", shutter circle with a tap pulse. should display a quick video of an artwork being snapped in the frame and the camera lens closing. I will upload a video to use later. 
- LOG: yellow bg, proof-sheet receipt draft, "LOG WHAT THE ART MEANT TO YOU"
- SHARE: teal bg, printer feeding the receipt (reusing the real feed animation), "SHARE YOUR MEMORY WITH THE WORLD"

These are static mock content — no DB writes, dismissible, swipeable between the three. There's an "X" on these pop-ups so user can close it anytime.

---

## 3. Onboarding survey (new route `src/routes/begin.tsx`)

One question per screen, cream background, back/next:

1. **Name** — prefilled from `localStorage` if remembered
2. **"Are you still at the museum?"** — Still here / Already left
3. **Museum name** — existing autocomplete component, moved here

On finish: creates the visit exactly as today and navigates to `/visit/$visitId`, carrying the capture mode (`snap` or `upload`) in search params so the visit page opens the right entry path.

---

## 4. Snap mode (new `src/components/camera-capture.tsx`)

For "still at the museum": a live in-page camera in the sketch style — `getUserMedia` with rear camera preference, sketch-border viewfinder, hand-drawn shutter circle. Captured frame becomes a File handed to the **existing** upload/identify pipeline — no change to identification, cropping, palette extraction, or proof sheet. Use the ochre bg color for this mode.

Falls back to the current file picker if permission is denied or the API is unavailable. "Already left" keeps today's upload flow unchanged.

---

## 5. Print page redesign (`visit.$visitId.tsx` print view + `printer-stage.tsx`)

- Teal background, SHARE pixel mark at the top
- Flat printer housing swapped in; slot geometry re-measured against the new artwork so the receipt still emerges from the slot
- Feed animation, timing, crumple/grain texture, receipt layout, and export logic all unchanged
- Two buttons stay: `SAVE TO CAMERA ROLL` and `LOG NEW MUSEUM`, restyled yellow-on-teal per the design

---

## 6. Global pixel-icon header

A small `ModeMark` component renders the single relevant pixel icon centered at the top of each screen: `+` on snap, `■` on the artwork entry/proof pages, `⠿` on the print page. Homepage shows all three inside the doodle as in its design.

---

## Technical notes

- Receipt component, `dither.ts`, `renderReceiptBlob`, edge function, and all server functions are untouched.
- Slot alignment constants in `printer-stage.tsx` are currently locked; they will be re-derived for the new flat printer image and the lock comment updated.
- Camera code is client-only (`useEffect` + `<ClientOnly>` gating) so SSR is unaffected.
- Each new route gets its own `head()` metadata.
- Visual verification via a headless browser pass over homepage, each demo, survey steps, and the print page at mobile width.