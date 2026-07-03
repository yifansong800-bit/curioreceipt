## Goal
When the user types a museum name on the landing screen, automatically identify its city and country, then display that location on the visit page and printed receipt.

## Approach
Use Lovable AI (Gemini) to resolve the museum → `{ city, country }`. It's a one-shot structured call, no external API keys, and handles fuzzy / partial names ("the Met", "moma", "louvre") better than a static list or a geocoder.

## User flow
1. Landing screen: user types name + museum, clicks "Begin visit".
2. On submit, a server function resolves the museum to `{ city, country }` before creating the visit row. If the model is unsure, both fields are stored as `null` (no guessing).
3. Visit page header shows `MUSEUM NAME — CITY, COUNTRY` under the title, with a small "edit location" affordance so the user can correct or fill it in manually.
4. Receipt renders the location as a new line directly under the museum name, styled in the same IBM Plex Mono caps as the rest of the header, so the PNG carries it too.

## Data model
Add two nullable columns to `public.visits`:
- `city text`
- `country text`

Migration adds the columns; existing rows stay `null`. No RLS changes needed — same policies apply.

## Server function
New `resolveMuseumLocation` in `src/lib/visits.functions.ts`:
- Input: `{ museum: string }`.
- Calls `google/gemini-3-flash-preview` via the Lovable AI Gateway helper with `Output.object({ city: string.nullable(), country: string.nullable(), confident: boolean })`.
- Prompt instructs: return the city and ISO country name of the museum; if not recognized or ambiguous, set `confident: false` and leave fields null.
- Wrapped in `try/catch NoObjectGeneratedError` — on any failure, returns `{ city: null, country: null }` so the visit still creates.

`createVisit` is updated to call `resolveMuseumLocation` inline and persist the result. Failure to resolve never blocks visit creation.

## UI changes
- `src/routes/visit.$visitId.tsx`: show location under the museum title; add an inline "edit" that opens a tiny two-field form (city, country) which calls a new `updateVisitLocation` server function.
- `src/components/receipt.tsx`: render a `LOCATION — CITY, COUNTRY` row in the header block, only when both are present.
- `artwork-card.tsx` is unchanged; the location lives on the visit, not per-artwork.

## Edge cases
- Museum name too short (<3 chars) or empty: skip the AI call.
- Model returns non-confident result: store `null` and let the user fill it manually.
- User edits the museum name later (not currently supported in v1): out of scope.

## Not doing
- No maps, no lat/long, no geocoding API, no per-artwork location.
- No automatic re-resolution if the user edits the museum name after creation — v1 resolves once at creation, and manual edit is the escape hatch.
