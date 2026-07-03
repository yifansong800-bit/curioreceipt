// ============================================================
// DO NOT MODIFY — printer asset (`@/assets/printer.png`),
// SLOT_Y_PCT (60), and SLOT_WIDTH_PCT (62) are LOCKED and tuned
// to the current printer artwork. Changing them will misalign
// the receipt with the printer's output slot.
// ============================================================
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import printerImg from "@/assets/printer.png";

type Mode = "idle" | "printing" | "printed";

// LOCKED — measured against src/assets/printer.png (1024x1024).
const SLOT_Y_PCT = 60;
const SLOT_WIDTH_PCT = 62;
const MAX_PRINTER_WIDTH = 460;

// Stepped feed: 8 discrete "clicks" ≈ 1 inch each.
const FEED_STEPS = 8;
const FEED_DURATION_MS = 8000;

export function PrinterStage({
  mode,
  onPrintComplete,
  children,
}: {
  mode: Mode;
  /** Retained for API compatibility; no longer rendered. */
  warmupDuration?: number;
  onPrintComplete?: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

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

  const printerHeight = printerWidth;
  const slotY = (printerHeight * SLOT_Y_PCT) / 100;
  const pullUp = printerHeight - slotY;

  const receiptNaturalWidth = 360;
  const receiptScale = (printerWidth * (SLOT_WIDTH_PCT / 100)) / receiptNaturalWidth;

  // Gate the receipt behind a two-rAF paint so the CSS keyframe's starting
  // transform (translateY(-100%)) is fully committed before the receipt
  // becomes visible. Without this gate the first paint after mount can flash
  // the receipt at its natural position for a single frame.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (mode !== "printing" && mode !== "printed") {
      setArmed(false);
      return;
    }
    if (mode === "printed") {
      setArmed(true);
      return;
    }
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mode]);

  // Unlock Download exactly when the stepped feed animation ends.
  const feedDurationMs = reduce ? 250 : FEED_DURATION_MS;
  useEffect(() => {
    if (mode !== "printing" || !armed) return;
    const t = window.setTimeout(() => {
      onPrintComplete?.();
    }, feedDurationMs);
    return () => window.clearTimeout(t);
  }, [mode, armed, feedDurationMs, onPrintComplete]);


  return (
    <div
      ref={wrapRef}
      className="mx-auto w-full"
      style={{ maxWidth: MAX_PRINTER_WIDTH }}
    >
      {/* Scoped keyframes for the stepped mechanical feed. */}
      <style>{`
        @keyframes curio-feed {
          from { transform: translateY(-100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      <div className="mx-auto flex flex-col items-center" style={{ width: printerWidth }}>
        <div
          style={{
            width: printerWidth,
            aspectRatio: "1 / 1",
            position: "relative",
            zIndex: 1,
            isolation: "isolate",
          }}
        >
          <img
            src={printerImg}
            alt=""
            width={1024}
            height={1024}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              userSelect: "none",
              pointerEvents: "none",
              filter: "drop-shadow(0 18px 28px rgba(53, 46, 35, 0.18))",
            }}
            draggable={false}
          />
        </div>

        {/* Receipt lane: pulled up so its top edge sits at the slot mouth. */}
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
                <div
                  style={{
                    position: "relative",
                    willChange: "transform",
                    // Default hidden above the slot; the CSS animation reveals
                    // it step-by-step once `armed` is true. Keeping this base
                    // transform means even if the animation attach is delayed
                    // by a frame, nothing flashes at translateY(0).
                    transform: mode === "printed" ? "translateY(0)" : "translateY(-100%)",
                    visibility: armed ? "visible" : "hidden",
                    ...(mode === "printing" && armed && !reduce
                      ? {
                          animation: `curio-feed ${FEED_DURATION_MS}ms steps(${FEED_STEPS}, end) forwards`,
                        }
                      : mode === "printing" && armed && reduce
                        ? { transform: "translateY(0)" }
                        : {}),
                  }}
                >
                  {children}
                  {/* Crumpled-paper shadow overlay */}
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
                </div>
              </div>

            </motion.div>
          ) : null}
        </AnimatePresence>

    </div>
  );
}
