# Plan: Stepped thermal-printer feed animation

## User request
Change the receipt-printing animation so it feels like a real thermal printer: slower, feeding out in discrete increments with brief pauses, taking about **4 seconds for the feed itself** (not including the existing 2-second warm-up).

## Files to edit
- `src/components/printer-stage.tsx`

## Changes
1. Increase the feed duration constant from `3200` to `4000` ms.
2. Update the deterministic `onPrintComplete` timer to match the new 4 s feed duration.
3. Replace the smooth `ease` transition on the receipt `y` transform with a Framer Motion `keyframes` array.
   - Define ~8 discrete steps.
   - Each step advances the receipt by a portion of its total travel distance.
   - Use a matching `times` array with small built-in pauses between steps to simulate the mechanical feed/print head motion.
4. Keep the existing infinite micro-jitter animation on the receipt during the feed so it still feels mechanical/vibrating.
5. Leave the warm-up phase, printer image, responsive scaling, and gating logic unchanged.

## Acceptance criteria
- After clicking “Ready to print”, the user sees only the printer + warm-up bar for 2 seconds.
- The receipt then begins feeding out in visible jerky/steps over ~4 seconds.
- The download button becomes available exactly when the 4-second feed finishes.
- Reduced-motion users still get a near-instant fallback.