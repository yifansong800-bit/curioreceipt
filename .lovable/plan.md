## Fix the "Couldn't add artwork" failure on the 2nd add

### Diagnosis so far

- DB shows no visit ever has more than one artwork — the 2nd add fails consistently, but the current UI just shows a generic alert so we can't see why.
- Server logs for the last hour show every `_serverFn` POST returning `200`, which points to a **client-side** failure happening either right after the successful `addArtwork` call or in the payload preparation for the 2nd submit (palette extraction, `arrayBuffer`, HEIC state carry-over, etc.).
- No RLS/GRANT/unique-constraint issue on `artworks` (service role bypasses RLS, and there's no unique on `(visit_id, position)`).

### Plan

1. **Surface the real error** in `src/routes/visit.$visitId.tsx` `AddArtworkForm.handleSubmit`:
   - Replace the generic `alert("Couldn't add artwork. Please try again.")` with an alert that includes `err instanceof Error ? err.message : String(err)`.
   - Also `console.error` with a labeled tag so it's easy to find in logs.

2. **Harden the submit path** so the most likely culprits can't silently break:
   - Wrap `exifr.parse`, `extractPalette`, `file.arrayBuffer()`, and `btoa` in a single `try` and treat photo-processing failures as "upload without image" rather than aborting the whole add.
   - Await `qc.invalidateQueries` in the `onSubmit` wrapper and convert the add to a `useMutation` so React state updates happen after the network round-trip settles (prevents a rerender-during-submit crash from bubbling into the catch).
   - Reset `file` and all form state **before** calling `onSubmit` returns' effects, so a stale `File` object can't be reused.

3. **Re-run and confirm**: with the real error surfaced, either:
   - If it's a validation error (e.g. base64 length cap, unsupported mime after HEIC conversion), fix the specific check in `src/lib/artworks.functions.ts`.
   - If it's a client-only crash (palette / exifr / arrayBuffer on a specific file), the hardened try/catch above already contains it.

### Files touched

- `src/routes/visit.$visitId.tsx` — better error surface, mutation-based add, defensive photo pipeline.
- `src/lib/artworks.functions.ts` — only if step 3 reveals a server-side rejection worth loosening.

No DB migrations, no design changes, no changes to the receipt or printer animation.
