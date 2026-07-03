## Changes to `src/components/printer-stage.tsx`

**Lock printer asset & sizes (no future drift)**
- Add a comment banner at top: "DO NOT MODIFY — printer asset, SLOT_Y_PCT, SLOT_WIDTH_PCT are locked."
- Freeze constants: `SLOT_Y_PCT = 60`, `SLOT_WIDTH_PCT = 62`, printer PNG = `src/assets/printer.png`.

**Remove warm-up progress bar**
- Delete the `warmup` phase UI (progress bar + "warming up" text).
- Keep the 2s delay — but during it, render only the printer (no bar, no label).
- Phase state becomes: `idle` (2s printer-only) → `printing` (receipt emerges) → `done` (download enabled).

**Slower, incremental "1 inch at a time" print motion**
- Replace the current sliding keyframes with a stepped reveal.
- Total print duration: ~8s (vs current 4s).
- Use ~8–10 discrete steps, each advancing the receipt ~1 inch (≈96px at base scale), with a short pause between steps to mimic mechanical feed (step easing, not smooth linear).
- Implementation: framer-motion `animate` with `times` array and `ease: "steps"` per segment, OR CSS `steps()` timing function on a translateY keyframe. Each step: quick push (~150ms) + hold (~700ms).

**Download button gating**
- Unchanged behavior: unlocks exactly when the stepped animation's total duration elapses (`setTimeout` matches new 8s duration + 2s warmup delay).

No changes to receipt look, crumple overlay, printer PNG, slot geometry, or any other file.