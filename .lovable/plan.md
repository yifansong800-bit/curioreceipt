## Goal

Hide the finished receipt until the user commits with a "Print receipt" action. On click, play a thermal-printer animation modeled on the reference GIF — printer body on top, the actual live Curio receipt feeding out of the slot — then reveal the full receipt and expose the PNG download.

## Flow

1. `/visit/:id` starts in **"compose" mode**: shows the museum header, the "Add artwork" form, and the list of entries. The receipt column is replaced by an empty printer graphic with a disabled `Print receipt` button underneath.
2. Button enables once there is ≥1 artwork (visitor name + museum are already captured on the start screen).
3. Click → transitions to **"printing" mode**: full-screen (or column-centered) printer stage plays a ~3.5s animation of paper feeding out of the slot with a small jitter, then settles.
4. On animation end → **"printed" mode**: receipt is fully visible below the printer, and `Download receipt (PNG)` is enabled. A small `↺ Print again` link replays the animation; `← Edit entries` returns to compose mode without losing data.

Nothing new is created server-side by "Print" — artworks are already persisted as they're added. Print is a pure reveal gesture.

## Animation approach

Use CSS/Framer-Motion (already presentation code, no runtime asset dependency, crisp at any DPR). Not a real video/GIF — a real GIF of a printer wouldn't line up with the user's dynamically generated receipt.

Composition (stacked in a fixed-width stage, ~380px wide):

```text
┌──────────────────────────┐
│      PRINTER BODY        │  ← static PNG (generated, cream to match Curio)
│  ┌────── slot ──────┐    │
│  └──────────────────┘    │
└────────┬─────────────────┘
         │  ← receipt slides down from behind the slot,
         ▼     clipped by an overflow mask above the slot line
    [ live <Receipt/> ]
```

Layers:
- **Printer graphic** — generate one 1024×768 PNG via `imagegen` (fast tier) matching the reference: chunky rounded cream plastic body, horizontal slot, subtle vents, top-down 3/4 view. Save to `src/assets/printer.png`. Prompt tuned to Curio's palette (cream `--paper`, ink dark type on a small label reading "CURIO"). Transparent bottom edge so the receipt appears to emerge from it.
- **Receipt** — the existing `<Receipt/>` component, positioned absolutely with `transform: translateY(-100%)` initially so it sits fully hidden behind the printer. Framer-Motion animates `translateY` from `-100%` → `0` over ~3s with `easeOut`, plus a 2Hz `y` micro-jitter (±1.5px) to fake stepper-motor feed. A subtle box-shadow along the slot edge fakes depth.
- **Slot mask** — a wrapper `div` with `overflow: hidden` whose top edge sits exactly at the printer's slot Y, so the receipt is visually cut off until it emerges.
- **Sound** — none (video-creator skill note: not applicable; this is in-app UI, not a rendered video).

Timing: 3.5s total. During animation, disable interactions and show a small "Printing…" caption under the printer. On `onAnimationComplete`, transition to `printed` state.

## Code changes

1. **`src/assets/printer.png`** (new) — generated via `imagegen` with a prompt matching the reference form-factor in Curio's cream aesthetic. Imported directly in the visit route.

2. **`src/components/printer-stage.tsx`** (new) — presentational component:
   - Props: `mode: "idle" | "printing" | "printed"`, `onPrintComplete: () => void`, `children` (the `<Receipt/>`).
   - Renders the printer image, the slot-masked receipt track, and manages the framer-motion animation.
   - Uses `motion.div` with `animate={{ y: mode === "idle" ? "-100%" : "0%" }}` and `transition={{ duration: 3.2, ease: [0.22, 1, 0.36, 1] }}` plus a repeating y-offset via `useMotionValue` for jitter that stops when animation completes.
   - When `mode === "idle"`, shows only the printer with a subtle idle wobble.

3. **`src/routes/visit.$visitId.tsx`** — behavior changes only, no server logic:
   - Add local state `stage: "compose" | "printing" | "printed"` (default `"compose"`).
   - Replace the current right-column "live preview + Download" with:
     - `stage === "compose"`: `<PrinterStage mode="idle">` + `Print receipt` button (disabled when `artworks.length === 0`).
     - `stage === "printing"`: `<PrinterStage mode="printing" onPrintComplete={() => setStage("printed")}>` containing the live receipt. Buttons hidden.
     - `stage === "printed"`: `<PrinterStage mode="printed">` (receipt fully out, static) + `Download receipt (PNG)` primary button + `Print again` and `Edit entries` secondary links.
   - `Edit entries` sets `stage` back to `"compose"`; adding/removing artworks while in `printed` mode also drops back to `"compose"` (source of truth is fresh entries).
   - The existing `toPng` download flow stays unchanged; it targets the `#curio-receipt` node which now lives inside the printer stage but is still in the DOM.

4. **Framer Motion dependency** — `motion` is not yet installed. Add `motion` (the modern package name; used as `import { motion } from "motion/react"`).

## Out of scope

- No changes to Supabase schema, server functions, dither, fonts, or the receipt design itself.
- Not rendering a real MP4/GIF; the animation is CSS/JS at runtime for crispness and to match the user's actual data.
- Sound effects (can add later if desired).

## Technical detail

- Printer image dimensions tuned so the slot lands at a known Y offset (e.g. printer image is 760×420 with slot centered at y=310). The slot-mask wrapper is positioned with `top: 310px` on the stage; the receipt inside translates from `-100%` to `0` within that wrapper — receipt never bleeds above the slot line.
- Jitter: `useAnimationFrame` writes a small sine offset to a `MotionValue` while `stage === "printing"`, then zeros out on complete.
- Accessibility: `prefers-reduced-motion` → skip translate/jitter, cross-fade from empty printer to printed receipt over 200ms.
- Idempotency: clicking `Print again` re-runs the animation without re-uploading anything.
