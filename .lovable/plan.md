## Goal

Turn the post-logging state on the visit page from a folded "PIECE LOGGED" box into a proper **proof sheet**: a mini receipt preview of everything entered, inline field editing, a crop tool for the photo, and a black-and-white / color ink toggle.

## 1. "Proof" panel replaces the folded box

Replace the `Piece logged — ready to print.` box + `Your piece` list with a single composed section styled as a torn receipt proof:

```text
┌─ paper edge (zigzag top) ──────────────┐
│  DOES THIS LOOK RIGHT?        [edit ✎] │
│  ------------------------------------  │
│  01  Gun (2010) — Liu Ye               │
│  * MEDIUM        OIL ON CANVAS      ✎  │
│  * LINGER TIME   1:50               ✎  │
│  I WAS...        [awe] [calm]       ✎  │
│  RATING          ★★★★☆              ✎  │
│  NOTE            "quiet and red"    ✎  │
│  ------------------------------------  │
│  [ photo thumb ]   crop / adjust →     │
│  INK:  [ B&W ]  [ COLOR ]              │
└─ zigzag bottom ────────────────────────┘
        READY TO PRINT? →
```

Details:
- Same monospace receipt typography and paper texture as `Receipt` — it reads as a shorter pre-print draft, not a form.
- Each row is tappable; tapping (or the small ✎) flips **only that row** in place into its input (text field, linger picker, emotion chips, half-star rating, 48-char note), with Save / Cancel on the row. No modal, no full-form re-entry.
- Rows animate with a short height/opacity transition so it feels like the paper adjusting.
- Empty fields show a faded `— add` affordance rather than being hidden.
- Keeps existing `remove` action, moved to a small link under the panel.

## 2. Ink mode: black & white vs color

- A two-option `INK` toggle in the proof panel; **black & white is the default** (current dithered thermal look).
- Selecting `COLOR` renders the artwork photo in its original colors on the receipt while the rest of the receipt stays thermal-mono.
- The choice is stored in page state and passed to `Receipt`, so the printer animation, the on-screen receipt, and the downloaded PNG all use the same mode. The export compositor already draws images itself, so it will draw the raw photo instead of the dithered data URL when color is on.
- Ink mode is a print preference only — not persisted to the database.

## 3. Crop / adjust photo

- The thumbnail in the proof panel opens a full-screen editor sheet: dark backdrop, photo centered, **free-form draggable/resizable crop rectangle** with rule-of-thirds guides, plus rotate-90 and reset. Confirm / Cancel in the receipt-style bar at the bottom.
- Live preview strip under the photo shows how the crop will look dithered on the receipt.
- On confirm, the cropped result is encoded via canvas, uploaded through the existing photo-upload server function, and the artwork's `image_url` is updated — that becomes the image used everywhere (receipt, print, download). The original is left in storage untouched.

## Technical notes

- All work lives in `src/routes/visit.$visitId.tsx` (compose view), a new `src/components/piece-proof.tsx` (proof panel + inline row editors) and `src/components/photo-cropper.tsx` (crop sheet, plain canvas + pointer events, no new dependency).
- `src/components/receipt.tsx` gains a `colorMode: "bw" | "color"` prop that bypasses `DitheredImage` when color; `src/lib/dither.ts` untouched.
- Crop uses the existing `downscaleImage`/canvas pattern; upload reuses `uploadArtworkPhoto`, update reuses `updateArtwork` (needs `imagePath` added to its patch handling in `src/lib/artworks.functions.ts`).
- Palette re-extraction runs on the cropped image so the entry-row gradient stays in sync.
- No schema change required.
