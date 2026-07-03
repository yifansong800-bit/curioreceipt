## Plan: Circular halftone for receipt artwork

Replace the Floyd–Steinberg 1-bit dither in `src/lib/dither.ts` with a **circular dot halftone** renderer, then wire it into `src/components/receipt.tsx` (which already calls `ditherImage`).

### Algorithm (in `src/lib/dither.ts`)

1. Load image to an offscreen canvas at a scale that keeps the receipt-width resolution (~420px wide, preserving aspect ratio as today).
2. Build a luminance map: `L = 0.299R + 0.587G + 0.114B` per pixel, normalized 0–1.
3. Overlay a **cell grid** of size `CELL = 4px` (tunable) across the image.
4. For each cell:
   - Average luminance of the pixels inside.
   - If `avgL > 0.80` → **skip** (leave transparent so cream paper shows).
   - Else compute density `d = 1 - avgL` (clamped), map to dot radius: `r = (CELL / 2) * sqrt(d)` (sqrt keeps perceived density linear).
   - Draw a solid black filled circle at the cell center on a **transparent** canvas.
5. Export as PNG data URL with alpha (not JPEG) so the paper shows through the highlights.

### Output contract

- Return `{ url, width, height }` as today — `receipt.tsx` needs no signature change.
- Keep the existing size-bucketing memoization in `DitheredImage` so re-renders don't flicker.
- Because output now has transparency, ensure the `<img>` in `receipt.tsx` has no background — it already sits on the cream paper.

### JPEG export compatibility

`html-to-image.toJpeg` in `visit.$visitId.tsx` already flattens onto `#f5ead5`, so transparent halftone dots will composite cleanly onto the cream background in the downloaded receipt.

### Tunables (top of `dither.ts`)

```ts
const CELL = 4;              // grid size in px — smaller = finer dots
const HIGHLIGHT_CUTOFF = 0.80; // luminance above this → blank
const GAMMA = 0.5;           // sqrt curve for radius mapping
```

### Files touched

- `src/lib/dither.ts` — rewrite core loop; keep exported function name/signature.
- `src/components/receipt.tsx` — no logic change; verify `<img>` has transparent background.

No DB, server, or asset changes.