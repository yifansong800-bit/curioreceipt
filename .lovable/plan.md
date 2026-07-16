
## 1. Reposition as "one favorite art piece"

- **Cap**: change `MAX_ARTWORKS` from `2` → `1` in `src/routes/visit.$visitId.tsx`, and the matching `count >= 2` guard in `src/lib/artworks.functions.ts` → `count >= 1`.
- **Copy / tagline** (`src/routes/index.tsx`):
  - Subhead: `A thermal receipt for your museum visit. / Log the works. Print the memory.` → `A thermal receipt for your favorite art piece. / One piece. One memory. Printed.`
  - Meta title/description updated to match (single-piece framing).
  - About dialog: reword "favorite pieces" line to singular framing.
- **Root head** (`src/routes/__root.tsx`): tweak description to "Curio prints your favorite museum art piece as a thermal receipt keepsake."
- **Visit page compose header**: replace "Add up to 2 artworks · N spots left" and the multi-photo picker copy with a single-piece framing: "Your favorite piece from this visit". Once one artwork exists, hide the picker entirely and show `1 of 1 logged — ready to print.` (already handled by `atCap`, just via `MAX_ARTWORKS=1`).
- **Print / share filenames**: no change (already per-visit).

Existing multi-visit flow (Log another museum, remembered visitor name) is preserved.

## 2. Redesign the upload → identify → reflect flow

Replace the current dual UI (multi-picker + "Add manually" collapsed form) with **one linear flow** that separates *what the piece is* (auto-filled) from *what it meant to you* (manual). Everything lives in `src/routes/visit.$visitId.tsx` — no schema changes.

Flow on the compose screen when no artwork exists yet:

```text
┌─ Step 1 · The piece ────────────────────────┐
│  [ Upload a photo of your favorite piece ]  │
│                                             │
│  (after upload)                             │
│   thumbnail   Identifying… ▍                │
│                                             │
│   Title       [ auto-filled, editable ]     │
│   Artist      [ auto-filled, editable ]     │
│   Year        [ auto-filled, editable ]     │
│   Medium      [ auto-filled, editable ]     │
│   ↳ "Couldn't identify — enter manually"    │
│     (only on low-confidence result)         │
│                                             │
│                          [ Next → ]         │
└─────────────────────────────────────────────┘
```

Clicking **Next** creates the artwork row (optimistic, same pipeline as today) and reveals Step 2 inline:

```text
┌─ Step 2 · Your reflection ──────────────────┐
│  Linger time     [ min ] [ sec ]            │
│  How it felt     [ chip picker + custom ]   │
│  Rating          ☆☆☆☆☆                     │
│                                             │
│         [ ← Back ]      [ Save piece ]      │
└─────────────────────────────────────────────┘
```

Behavior details:
- **Auto-identify is instant** — fires the moment a photo is chosen (no button). Uses the existing downscale + `identifyArtwork` pipeline. Fields prefill only if still empty; user can overwrite anything.
- **No "identify artwork" button** anywhere — the button and its hint text are removed from `AddArtworkForm`. The multi-photo picker and the "Add manually" toggle are also removed. The single new form replaces both.
- **Step 1 → Step 2 gating**: Next is disabled until a photo is chosen AND title has a value (either identified or typed). Skipping identify is still possible — user types it in and hits Next.
- **Persistence timing**: the artwork row is inserted at end of Step 1 (Next). Step 2's Save issues `updateArtwork` with linger/emotions/rating, then returns to the "ready to print" state. Cancel/Back from Step 2 keeps the row (so identify credits aren't wasted) and just lets the user tweak fields again.
- **Editing an existing entry** (the row's "edit" link) opens the same two-step form pre-filled, so the reflection fields don't get lost.
- **Enter-key guard**: keep the existing `onKeyDown` protection so Enter never submits accidentally.

## 3. Improve identification accuracy

Two changes in `src/lib/artworks.functions.ts` `identifyArtwork`:

- **Model swap**: `google/gemini-3-flash-preview` → `google/gemini-3-pro-preview` (higher-fidelity multimodal recognition; catalog id verified before wiring). This raises cost per identify from ~0.02–0.05 credits to ~0.10–0.20 credits, but since the cap is now **1 identify per visit**, per-visit cost drops overall vs the previous 2-photo flow.
- **Stricter prompt + confidence gate**:
  - Require the model to name the specific work only when it recognizes both the artist's characteristic style AND matches the museum context provided.
  - Ask for a self-reported confidence rubric ("only mark confident=true if you would stake your reputation on this exact title+artist"). Any uncertainty → `confident=false` and null fields.
  - Add a lightweight sanity check server-side: reject the result (treat as not confident) if `title` or `artist` is empty/whitespace, or if the returned year clearly contradicts the museum era (skip if unsure — keep it minimal to avoid false negatives).
- Timeout stays at 8s; abort on user cancel/back preserved.

If the model returns non-confident, Step 1 shows the "couldn't identify — enter manually" hint inline (same string as today) and clears when the user edits any field.

## Technical notes

- Files changed:
  - `src/routes/visit.$visitId.tsx` — replace `MultiPhotoPicker` + `AddArtworkForm` + `EditArtworkForm` with a new `PieceForm` component driving Step 1 / Step 2. Reuse `addArtworkFromPayload` for insert; add a new "update reflection" path that calls `updateArtwork` with only linger/emotions/rating.
  - `src/routes/index.tsx` — tagline + about copy.
  - `src/routes/__root.tsx` — meta description.
  - `src/lib/artworks.functions.ts` — cap `>= 1`; swap model; tighten prompt; add sanity check.
  - `src/components/artwork-card.tsx` — no change (identifyFailed hint already supported).
- No DB migration. No changes to `receipt.tsx`, `printer-stage.tsx`, dither pipeline, or download rendering.
- Typecheck + a manual walk-through (upload → auto-identify → edit fields → Next → linger/emotions/rating → Save → print → download) before shipping.

## Non-goals

- No web search / external art database lookup (out of scope for credits; better prompting + stronger model is the accuracy lever here).
- No changes to receipt visuals, print animation, or storage/RLS posture.
- No support for logging multiple pieces per visit — that's the whole point of this repositioning.
