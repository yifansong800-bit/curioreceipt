## Manual "Identify artwork" button on the add-artwork form

A small user-triggered button under the photo upload that runs vision-AI identification on demand. Nothing runs automatically — no credits are spent unless the user taps it.

### UI

In `AddArtworkForm` (in `src/routes/visit.$visitId.tsx`), directly under the photo preview / file input:

```
Can't remember the details?  [ ✨ Identify artwork ]
```

- Button is disabled until a photo has been picked (and photo-processing has finished).
- While the request is in flight: label changes to "Identifying…" and the button is disabled.
- On success: prefill Title, Artist, Year, Medium — but only fields the user hasn't already typed into. Show a tiny "filled from photo — edit anything" hint that auto-clears after ~4s.
- On "couldn't identify": inline hint "Couldn't identify this piece — enter details manually." No error toast.
- Button hides once the user submits the artwork or removes the photo.

Styled to match the existing muted secondary-button look on the form (no new design tokens).

### Fields identified

Title, Artist, Year, Medium — all four map to existing artwork fields. No schema/migration changes.

- Year is stored in the existing `year` column on `artworks`. The model returns a free-form string ("1889", "c. 1503", "1912–1913"); on prefill we coerce it to whatever type the current Year input expects (checked against `src/integrations/supabase/types.ts` and the current form field before wiring).

### Server function: `identifyArtwork` in `src/lib/artworks.functions.ts`

- Input (Zod): `{ imageBase64: string, mimeType: 'image/jpeg'|'image/png'|'image/webp', museum?: string, city?: string|null, country?: string|null }`. Size cap on the base64 string (~4 MB) to protect the gateway.
- Model: `google/gemini-3-flash-preview` via `createLovableAiGatewayProvider` (already in `src/lib/ai-gateway.server.ts`). Multimodal `image_url` block with the data URL. Temperature 0. Small `maxOutputTokens` (~200).
- Prompt: "Identify this artwork. Museum context: {museum, city, country}. Return JSON `{ confident: boolean, title, artist, year, medium }` — each field a string or null. If unsure it's a specific real, publicly-known artwork, set confident=false and all fields null. Never guess."
- Parse with the same `parseJsonObject` pattern already used in `visits.functions.ts`. On any failure / non-confident result, return all-null.
- Wrapped in a ~8s timeout so a hung provider can't freeze the button.

### Client wiring

- `identifyArtwork` called via `useServerFn` from the new button's `onClick`.
- Client-side downscale of the picked photo to ~1024px longest edge before base64 encoding — reuse `src/lib/downscale.ts`. Keeps upload payload small and per-call credit cost low.
- Prefill logic only sets a field if its current value is empty/whitespace.
- AbortController tied to the button so tapping "Identify" a second time (or removing the photo) cancels the previous request.

### Cost visibility

After you ship and try it a couple of times, we can pull the exact per-call credit numbers from AI Gateway logs. If higher than expected we can drop resolution to 768px or switch to a cheaper multimodal model.

### Non-goals

- No auto-identification on upload (explicitly gated behind the button).
- No web scraping / museum-DB lookup — Gemini's knowledge only.
- No auto-submit — user still clicks Add.
- No changes to receipt animation, download rendering, DB schema, or security posture.

### Files touched

- `src/routes/visit.$visitId.tsx` — button, state, prefill, hint under photo.
- `src/lib/artworks.functions.ts` — new `identifyArtwork` server function.
- No migration, no changes to `src/lib/ai-gateway.server.ts`.
