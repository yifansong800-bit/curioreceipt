**Why:** iPhone camera roll photos are HEIC by default. Safari sometimes transcodes on upload, but not reliably; desktop browsers can't decode HEIC at all — which is why the uploaded HEIC didn't display. The file input already accepts camera-roll photos on mobile (`accept="image/*"` triggers the Photos picker on iOS/Android); the missing piece is format handling.

**Change — `src/routes/visit.$visitId.tsx` only:**

1. `bun add heic2any`.
2. File input:
   - `accept="image/*,.heic,.heif"` so iOS/desktop pickers surface HEIC files from the camera roll and Finder.
   - In `onChange`, detect HEIC via MIME (`image/heic` / `image/heif`) or `.heic`/`.heif` extension (iOS sometimes reports empty MIME).
   - If HEIC: dynamic `import("heic2any")` (client-only, keeps SSR clean), convert to JPEG blob (quality 0.9), wrap as a new `File` with `.jpg` name + `image/jpeg` type, then `setFile`.
   - Add a "Converting photo…" state on the upload label during conversion so users aren't confused on slower phones.
   - On failure, toast: "Couldn't read this photo — try a JPG or PNG."
3. No downstream changes — dither, palette, and Supabase storage upload already handle JPEG.

No schema, storage bucket, receipt, or printer changes.