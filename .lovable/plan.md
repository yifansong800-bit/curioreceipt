## Fix printer image + receipt feed animation

### 1. Regenerate the printer as a transparent bird's-eye PNG

Replace `src/assets/printer.jpg` with `src/assets/printer.png`:

- Use `imagegen--generate_image` with `transparent_background: true`, `.png` target.
- Prompt: top-down / bird's-eye view of a small white thermal receipt printer (matching the reference photo — ridged white plastic body, rectangular paper slot at the front edge, no receipt visible), centered on a solid white background, soft studio lighting, no shadow beneath.
- Model tier: `premium` (clean product shot, crisp slot edge matters for the mask).

Update the import in `src/components/printer-stage.tsx` from `printer.jpg` → `printer.png`.

### 2. Make the receipt appear to feed out of the slot

The current bug: the receipt track sits below the printer image with a negative `marginTop`, so the receipt just slides down behind, then out under, the whole printer rectangle. It never looks like it emerges from the slot.

Not a GIF — we keep the existing Framer Motion animation but fix the stacking so the paper visually exits the slot:

```text
[layer 3] printer image (transparent PNG)     z-index: 3
[layer 2] receipt (motion.div, animates down) z-index: 2   ← clipped to start at slot Y
[layer 1] (nothing / page background)         z-index: 1
```

Key changes in `src/components/printer-stage.tsx`:

- Container becomes `position: relative` with a fixed aspect ratio matching the printer PNG.
- Printer `<img>` is absolutely positioned, `z-index: 3`, `pointer-events: none`.
- Receipt track is absolutely positioned at the slot's Y coordinate (measured once from the new PNG — roughly `top: 55%` for a bird's-eye printer where the slot is near the front edge), horizontally centered, width ≈ the slot width (~38% of printer width), `z-index: 2`.
- Animate `translateY` from `0` (receipt fully hidden behind printer above the slot) down to its final resting position, with the stepper-motor jitter kept.
- Add `overflow: hidden` + a `clip-path` on the receipt wrapper so the top of the receipt is masked above the slot line — this sells "emerging from the slot" instead of "sliding on top of the printer."
- Extend the outer container's height so the receipt has room to hang below the printer in the `printed` state.

### 3. Keep download working

The visible animated receipt is a scaled preview; the hidden full-size `#curio-receipt` node used by `html-to-image` is unchanged, so PNG export still captures the full receipt at full resolution. No changes needed in `src/routes/visit.$visitId.tsx`.

### Technical notes

- No new dependencies. No GIF pipeline — Framer Motion + clip-path is smoother, resolution-independent, and matches the reference behavior.
- Slot coordinates (top %, width %) will be tuned after seeing the generated PNG; expect one small follow-up tweak.
- `src/assets/printer.jpg` is deleted after the PNG lands.