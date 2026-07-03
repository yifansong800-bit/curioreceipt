Refresh the printer illustration so it feels more considered and matches the receipt's warm, tactile aesthetic — without changing the flow or animation logic.

## What changes

Regenerate `src/assets/printer.png` as a bird's-eye render with a more refined industrial-design language:

- Softer, off-white / warm ivory body (subtly tinted toward the receipt's cream `--paper`) so the printer sits in the same visual world as the receipt instead of reading as pure clinical white.
- Rounded pill-shaped silhouette with a gentle top-shell seam and a slim recessed front panel around the slot, giving it a small, boutique "object" feel (à la Muji / Braun / Teenage Engineering).
- A darker, precisely drawn slot with a subtle inner lip shadow, sized to keep the current 47% slot width so the receipt still emerges exactly slot-width.
- One small status indicator dot and one hairline seam — no logos, no text, no clutter.
- Soft ambient contact shadow beneath, transparent background preserved.

## What stays the same

- `src/components/printer-stage.tsx` logic, timings, warmup bar, and crumpled-paper receipt overlay.
- Slot geometry constants (`SLOT_Y_PCT`, `SLOT_WIDTH_PCT`) — the new render targets those same proportions so no code changes are needed. If the regenerated image lands slightly off, nudge only those two constants.
- Receipt component, download gating, and print flow.

## Technical notes

- Single file replaced: `src/assets/printer.png` (transparent PNG, 1024×1024).
- After regeneration, visually verify the slot sits at ~64% height and ~47% width; adjust the two constants in `printer-stage.tsx` only if needed.