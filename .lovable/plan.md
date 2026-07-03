**Root cause:** the route sets `stage = "printing"` the moment the user clicks "Ready to print?", so the receipt animation kicks off in the same frame the printer image mounts. The receipt reads as "already there" instead of feeding out.

**Fix:** introduce a real pre-roll before the animation.

1. **`src/routes/visit.$visitId.tsx`**
   - Add `"idle"` to the `Stage` union: `"idle" | "printing" | "printed"`.
   - `goToPrint()` sets `stage = "idle"`.
   - `useEffect`: when `view === "print"` and `stage === "idle"`, start a 2000ms timer that flips to `"printing"`. Clear on unmount / view change.
   - "Print again" resets through `"idle"` so the pre-roll replays.

2. **`src/components/printer-stage.tsx`**
   - `mode === "idle"`: render only the printer image + a small centered "warming up…" caption so the wait feels intentional. Lane not rendered.
   - `mode === "printing"`: current feed-out animation runs.
   - `mode === "printed"`: receipt at final position (unchanged).
   - Keep `AnimatePresence initial={false}` so the lane mounts fresh on `idle → printing`, guaranteeing the slide-in plays.