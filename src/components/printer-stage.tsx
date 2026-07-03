import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import printerImg from "@/assets/printer.png";

type Mode = "idle" | "printing" | "printed";

// Measured from the generated bird's-eye printer PNG (1024x1024).
// Slot mouth (the dark gap) sits ~66% down the image.
const SLOT_Y_PCT = 66;
// Slot mouth width relative to the printer image width.
const SLOT_WIDTH_PCT = 33;

const MAX_PRINTER_WIDTH = 460;

function PrinterBody({
  width,
  slotTopPercent,
  slotWidthPercent,
}: {
  width: number;
  slotTopPercent: number;
  slotWidthPercent: number;
}) {
  const slotWidth = width * (slotWidthPercent / 100);

  return (
    <div
      aria-hidden
      data-printer-visual-anchor="warmup-visible"
      style={{
        width,
        aspectRatio: "1 / 1",
        position: "relative",
        borderRadius: "18%",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 52% 18%, rgba(255,255,255,0.95), transparent 28%), linear-gradient(145deg, #fffdf6 0%, #eee8d8 58%, #d5ccb8 100%)",
        border: "1px solid rgba(53, 46, 35, 0.18)",
        boxShadow:
          "0 24px 44px rgba(53, 46, 35, 0.18), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 -18px 28px rgba(72, 60, 42, 0.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "32%",
          height: 1,
          background: "rgba(53, 46, 35, 0.2)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.75)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: `${slotTopPercent}%`,
          left: "50%",
          width: slotWidth,
          height: Math.max(8, width * 0.03),
          transform: "translate(-50%, -50%)",
          borderRadius: 5,
          background: "linear-gradient(#0f0e0d, #363025 54%, #0b0a09)",
          border: "2px solid rgba(255,255,255,0.62)",
          boxShadow:
            "0 0 0 1px rgba(53,46,35,0.24), inset 0 2px 4px rgba(0,0,0,0.85)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "24%",
          right: "18%",
          width: Math.max(5, width * 0.018),
          height: Math.max(5, width * 0.018),
          borderRadius: "50%",
          background: "rgba(53,46,35,0.52)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.55)",
        }}
      />
    </div>
  );
}

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
  // Match receipt width exactly to the printer's slot width.
  const receiptScale = (printerWidth * (SLOT_WIDTH_PCT / 100)) / receiptNaturalWidth;

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
      <div className="mx-auto flex flex-col items-center" style={{ width: printerWidth }}>
        {/* Keep the printer mounted in every phase. The CSS body is the
            guaranteed warm-up visual; the PNG is decorative, so a future
            asset/style change cannot leave the warm-up stage blank again. */}
        <div
          style={{
            width: printerWidth,
            aspectRatio: "1 / 1",
            position: "relative",
            zIndex: 1,
            isolation: "isolate",
          }}
        >
          <PrinterBody
            width={printerWidth}
            slotTopPercent={SLOT_Y_PCT}
            slotWidthPercent={SLOT_WIDTH_PCT}
          />
          <img
            src={printerImg}
            alt=""
            width={1024}
            height={1024}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              zIndex: 1,
              opacity: mode === "idle" ? 0 : 1,
              transition: "opacity 0.2s ease",
              userSelect: "none",
              pointerEvents: "none",
            }}
            draggable={false}
          />
        </div>

        {/* Warm-up indicator: placed directly beneath the printer image. */}
        {mode === "idle" ? (
          <div className="w-full mt-4 space-y-2">
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
        ) : null}

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
                width: "100%",
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
                  style={{ position: "relative" }}
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
                  {/* Crumpled-paper shadow overlay: soft diagonal creases that
                      sit on top of the receipt while it's feeding out. */}
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      mixBlendMode: "multiply",
                      opacity: mode === "printing" ? 0.55 : 0.35,
                      backgroundImage: [
                        "linear-gradient(105deg, transparent 0%, rgba(0,0,0,0.14) 12%, transparent 22%, transparent 38%, rgba(0,0,0,0.10) 46%, transparent 58%, transparent 72%, rgba(0,0,0,0.12) 82%, transparent 92%)",
                        "linear-gradient(75deg, transparent 0%, transparent 18%, rgba(0,0,0,0.08) 28%, transparent 40%, transparent 62%, rgba(0,0,0,0.10) 72%, transparent 84%)",
                        "radial-gradient(120% 40px at 50% 0%, rgba(0,0,0,0.28), transparent 70%)",
                      ].join(", "),
                      transition: "opacity 0.4s ease",
                    }}
                  />
                </motion.div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {mode === "printing" ? (
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
