import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import printerImg from "@/assets/printer.png";

type Mode = "idle" | "printing" | "printed";

// Measured from the generated bird's-eye printer PNG (1024x1024).
// Slot mouth (the black gap) sits ~72% down the image.
const SLOT_Y_PCT = 72;
// Slot mouth width relative to the printer image width.
const SLOT_WIDTH_PCT = 44;

const MAX_PRINTER_WIDTH = 460;

export function PrinterStage({
  mode,
  warmupDuration = 2000,
  onPrintComplete,
  children,
}: {
  mode: Mode;
  warmupDuration?: number;
  onPrintComplete?: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  // Responsive printer width: shrinks to fit narrow viewports so nothing
  // overflows on phones, but caps at MAX_PRINTER_WIDTH on desktop.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [printerWidth, setPrinterWidth] = useState<number>(MAX_PRINTER_WIDTH);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setPrinterWidth(Math.min(MAX_PRINTER_WIDTH, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const printerHeight = printerWidth; // PNG is square
  const slotY = (printerHeight * SLOT_Y_PCT) / 100;
  // Distance from bottom of printer image up to the slot line — how much we
  // need to pull the receipt up so its top edge sits at the slot mouth.
  const pullUp = printerHeight - slotY;

  // Receipt renders at its natural 360px width. Use CSS `zoom` (not
  // transform: scale) so the scaled receipt takes real layout space and
  // pushes elements below it downward — otherwise it overlaps the
  // Download / Edit buttons underneath.
  const receiptNaturalWidth = 360;
  const receiptScale = (printerWidth * (SLOT_WIDTH_PCT / 100) * 1.15) / receiptNaturalWidth;

  // Deterministic gating: fire onPrintComplete exactly when the feed
  // animation finishes. Using a timer (not motion's onAnimationComplete)
  // means interruptions from navigating back mid-print never spuriously
  // mark the receipt as "printed". If the user leaves the printing
  // state, the timer is cleared before it can fire.
  const feedDurationMs = reduce ? 250 : 3200;
  useEffect(() => {
    if (mode !== "printing") return;
    const t = window.setTimeout(() => {
      onPrintComplete?.();
    }, feedDurationMs);
    return () => window.clearTimeout(t);
  }, [mode, feedDurationMs, onPrintComplete]);

  return (
    <div
      ref={wrapRef}
      className="mx-auto w-full"
      style={{ maxWidth: MAX_PRINTER_WIDTH }}
    >
    <div className="mx-auto" style={{ width: printerWidth }}>
      {/* Printer image — behind the receipt so the paper appears to drape
          out of the slot mouth over the printer's front lip. */}
      <img
        src={printerImg}
        alt=""
        width={1024}
        height={1024}
        style={{
          width: printerWidth,
          height: "auto",
          display: "block",
          position: "relative",
          zIndex: 1,
          userSelect: "none",
          pointerEvents: "none",
        }}
        draggable={false}
      />

      {/* Receipt lane: pulled up so its top edge sits at the slot mouth.
          overflow:hidden clips the animated content above that edge. */}
      <AnimatePresence initial={false}>
        {mode === "printing" || mode === "printed" ? (
          <motion.div
            key="lane"
            initial={{ height: 0, opacity: 1 }}
            animate={{ height: "auto" }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              marginTop: -pullUp,
              position: "relative",
              zIndex: 2,
              overflow: "hidden",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ zoom: receiptScale, width: receiptNaturalWidth }}>
              <motion.div
                initial={
                  mode === "printed"
                    ? { y: 0 }
                    : reduce
                      ? { y: 0, opacity: 0 }
                      : { y: "-100%" }
                }
                animate={reduce ? { y: 0, opacity: 1 } : { y: 0 }}
                transition={{
                  duration: reduce ? 0.25 : mode === "printed" ? 0 : feedDurationMs / 1000,
                  ease: reduce ? "easeOut" : [0.22, 1, 0.36, 1],
                }}
              >
                {mode === "printing" && !reduce ? (
                  <motion.div
                    animate={{ y: [0, -0.8, 0.8, -0.6, 0.6, 0] }}
                    transition={{
                      duration: 0.18,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    {children}
                  </motion.div>
                ) : (
                  children
                )}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {mode === "idle" ? (
        <div className="mt-4 space-y-2" style={{ width: printerWidth }}>
          <div className="flex items-center justify-between">
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--ink-soft)" }}
            >
              Warming up printer
            </span>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--ink-soft)" }}
            >
              {(warmupDuration / 1000).toFixed(1)}s
            </span>
          </div>
          <div
            className="h-1 w-full overflow-hidden"
            style={{ backgroundColor: "var(--border)" }}
          >
            <motion.div
              className="h-full origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: warmupDuration / 1000, ease: "linear" }}
              style={{ backgroundColor: "var(--ink)" }}
            />
          </div>
        </div>
      ) : mode === "printing" ? (
        <div
          className="text-center mt-3 text-xs uppercase tracking-widest"
          style={{ color: "var(--ink-soft)" }}
        >
          printing…
        </div>
      ) : null}
    </div>
    </div>
  );
}
