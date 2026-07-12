
## Multi-photo upload + auto-identify, capped at 2 artworks

Replace the "single photo → manual fields → Identify button" flow with a multi-select photo picker that auto-identifies each photo in the background. Hard cap the visit at 2 artworks.

### UX

On `visit.$visitId.tsx`:

- Replace the current single-file input in `AddArtworkForm` with a **multi-select picker**: `<input type="file" accept="image/*" multiple />`. On mobile this opens the OS photo picker with multi-select; on desktop, the file dialog.
- When the user picks photos, the form is **bypassed entirely** for those photos:
  - Each photo becomes its own artwork row immediately (optimistic insert, same path as today's optimistic add).
  - Auto-identify runs in the background per photo. Fields prefill on success; on non-confident/failure, a small inline hint appears on that row: **"couldn't identify — enter manually"** (auto-clears once the user edits any field on that row, or after ~8s).
  - Linger time, emotions, rating remain empty — user fills those in via the existing edit flow.
- Manual "type it in yourself" path stays available: a small **"Add manually"** link under the picker opens the current form (title/artist/etc.) with no photo or with a single photo.

### Hard 2-artwork cap

- If the visit already has N artworks (N ≥ 2), the picker and "Add manually" link are hidden and replaced with a muted line: **"2 of 2 artworks logged — ready to print."**
- If the visit has 1 artwork and the user picks 2+ photos, we accept only the **first** photo and show a one-line hint: **"Only 1 more artwork allowed on this receipt."**
- If the visit has 0 artworks and the user picks 3+, we accept only the **first 2** with the same hint.
- Cap is also enforced server-side in `addArtwork` (`src/lib/artworks.functions.ts`): after the existing `count` query, reject with `Error("Artwork limit reached")` if `count >= 2`. Client rolls back optimistic rows on that error (existing rollback path).

### Auto-identify wiring

- Reuse existing `identifyArtwork` server fn in `src/lib/artworks.functions.ts` — no changes to the function itself.
- Per photo, after the optimistic row exists and the upload+downscale has produced a base64 payload, call `identifyArtwork` with `{ imageBase64, mimeType, museum, city, country }`.
- On confident result: call `updateArtwork` to persist title/artist/year/medium **only for fields still empty** on that row (mirrors today's "don't overwrite user input" rule).
- On non-confident / error / timeout: set a per-row `identifyFailed` flag in local component state (keyed by artwork id) → renders the "couldn't identify — enter manually" hint on that row's card. Flag clears when the user edits any of title/artist/year/medium on that row, or after 8s.
- One in-flight identify per photo. If the user removes the row before identify resolves, abort via `AbortController`.

### Files touched

- `src/routes/visit.$visitId.tsx` — replace form entry point with multi-picker, batch optimistic inserts, per-row auto-identify, hard cap UI, "Add manually" fallback.
- `src/components/artwork-card.tsx` — accept + render the "couldn't identify — enter manually" hint (small muted line, matches existing hint styling).
- `src/lib/artworks.functions.ts` — enforce `count >= 2` cap server-side in `addArtwork`.

No schema changes. No changes to `identifyArtwork`, `ai-gateway.server.ts`, `downscale.ts`, or receipt rendering.

### Credit cost (recap)

- Cap = 2 identifies per visit, worst case. Estimated **~0.04–0.10 credits per full visit** with current `google/gemini-3-flash-preview` at 1024px. If real usage runs high after ship, we drop to 768px longest edge in `downscaleImage` — one-line change.

### Non-goals

- No true camera-roll/album integration (not possible on the web).
- No auto-fill of linger time / emotions / rating — those stay user-entered.
- No change to receipt animation, download rendering, or auth/security posture.
