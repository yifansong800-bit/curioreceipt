## Goal

Replace the current zigzag/perforated receipt paper with the exact scalloped paper shown in the reference: rounded "teeth" bumps along the top and bottom edges, plus a dotted perforation line just inside each edge, on the cream paper tone.

## Approach

Reproduce the edge in CSS/SVG (not as a raster image) so the receipt scales cleanly at any width, exports crisply to PNG via `html-to-image`, and keeps the paper grain overlay working.

### Changes

1. **`src/styles.css` — rewrite the `receipt-paper` utility**
   - Remove the current conic-gradient zigzag mask.
   - Build a scalloped mask using a repeating radial-gradient of small circles ("teeth") along the top and bottom edges. Tooth diameter ~14px, spaced edge-to-edge, so the outline reads as continuous rounded bumps like the reference.
   - Add a `::before` pseudo-element that draws two horizontal dotted perforation lines (one below the top teeth, one above the bottom teeth) using `border-top: 1.5px dotted` in the ink-soft color, positioned ~10px from each edge.
   - Keep the cream `--paper` fill and preserve compatibility with the existing `.grain` overlay (grain stays clipped to the scalloped shape because it's a child inside the masked element).
   - Ensure the mask uses both `-webkit-mask` and `mask` for Safari + Chromium, and that PNG export via `html-to-image` captures the shape (masks render correctly in `toPng`; no extra work needed).

2. **`src/components/receipt.tsx` — spacing tweak only**
   - Bump top/bottom padding from 28/32 to ~40/44 so content clears the new scalloped edge + dotted perf line. No structural or content changes.

### Out of scope

- No changes to routes, server functions, database, dither, or download logic.
- Not embedding the uploaded PNG as a background image — reproducing it in CSS keeps the receipt responsive and export-crisp.

## Technical detail

Scallop mask sketch (top edge; bottom mirrors it):

```text
mask =
  linear-gradient(#000, #000)                     ← body fill, inset by tooth radius top & bottom
  + radial-gradient(circle 7px at 7px 7px, #000 7px, transparent 7.5px) repeat-x top / 14px 14px
  + radial-gradient(circle 7px at 7px 7px, #000 7px, transparent 7.5px) repeat-x bottom / 14px 14px
```

Perforation lines: absolutely positioned 1.5px dotted borders in `--ink-soft` at ~14px from top and bottom, matching the faint dashed line visible just inside the teeth in the reference.
