## Split the flow into Compose → Print

### Phase 1 — Compose (no printer visible)

Restructure `src/routes/visit.$visitId.tsx` from the current two-column layout into a **single centered composer**.

- Header: visitor name + museum + session number.
- "Add artwork" form (unchanged: photo, title, artist, medium, emotions).
- Below the form, a stack of added artwork **cards** — small tile with the dithered thumbnail, title / artist, linger time, delete button. Not a receipt preview.
- Hard cap: **3 artworks max**. Once 3 are added, the form is replaced by a "3 / 3 artworks added" note. Helper text on the form: "Add up to 3 artworks · 2 more room".
- Primary CTA at the bottom: **"Ready to print? →"**, disabled until at least 1 artwork exists.
- No printer, no receipt preview anywhere.

### Phase 2 — Print (clean, efficient reveal)

Clicking "Ready to print?" swaps the compose view for the print view **in place** — same route, same container. No modal, no scrim, no drop-in animation, no striped desk backdrop.

Sequence:

1. Compose column fades out (150ms).
2. Print view fades in (150ms) in the same slot: a small back arrow "← Edit entries" at the top-left, then the centered printer, then the receipt paper-feed animation runs immediately from the slot (existing `PrinterStage` behavior, unchanged).
3. When the feed finishes, the **Download receipt (PNG)** button appears directly below the receipt, plus a subtle "↺ Print again" text link next to Edit.

That's the whole reveal — a crossfade between two views. No cinematic beats.

Reduced-motion: skip the crossfade, snap between views. Print animation already respects `useReducedMotion`.

### Phase 3 — After print

- **Download receipt (PNG)** — primary button, unchanged behavior.
- **← Edit entries** — returns to compose with artworks intact.
- **↺ Print again** — replays the feed animation.
- Escape key = Edit entries.

### Layout / structure changes

- Composer becomes a single centered column (max ~640px). `PrinterStage` no longer sits inside it.
- New component `src/components/artwork-card.tsx` — the stacked tile in the compose list.
- Route holds a `view: "compose" | "print"` flag driving the crossfade, with the existing `stage: "printing" | "printed"` used inside the print view.
- The hidden full-size `#curio-receipt` node used by `html-to-image` stays rendered (offscreen) whenever there's ≥1 artwork, so download works from the print view without waiting on layout.

### What stays the same

- Data model, server functions, upload, EXIF, dithering, `Receipt`, PNG export.
- `PrinterStage` — the slot alignment, feed animation, and jitter are all unchanged.

### Order of implementation

1. Composer refactor: single column, artwork-card list, 3-item cap, "Ready to print?" CTA.
2. Route-level `view` flag + crossfade between compose and print sections.
3. Wire existing `PrinterStage` into the print view; verify feed + download.
4. Post-print actions (download / print again / edit).
5. Reduced-motion + Esc key.

Assumptions unless you say otherwise:
- **3 is a hard cap.**
- **Same route, in-place crossfade** (no modal, no new URL).