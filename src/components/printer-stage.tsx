import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import printerImg from "@/assets/printer.png";

type Mode = "idle" | "printing" | "printed";

// Measured from the generated bird's-eye printer PNG (1024x1024):
// paper-exit slot mouth is centered around 72% down the image.
const SLOT_Y_PCT = 72;
// Slot mouth width relative to the printer image width.
const SLOT_WIDTH_PCT = 44;

export function PrinterStage({
  mode,
  onPrintComplete,
  children,
}: {
  mode: Mode;
  onPrintComplete?: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const printerWidth = 460;
  // The generated PNG is square (1024x1024).
  const printerHeight = printerWidth;
  const slotY = (printerHeight * SLOT_Y_PCT) / 100;
  const slotWidth = (printerWidth * SLOT_WIDTH_PCT) / 100;

  // Receipt renders at its natural 360px width. Scale it down so the paper
  // reads as roughly slot-width when it hangs out (slightly wider than the
  // slot mouth, matching the reference photo).
  const receiptNaturalWidth = 360;
  const receiptScale = (slotWidth * 1.15) / receiptNaturalWidth;

  return (
    <div
      className="mx-auto"
      style={{ width: printerWidth, position: "relative" }}
    >
      {/* Printer image sits on top so the receipt appears to come out of
          the slot mouth (anything above the slot is hidden behind it). */}
      <div style={{ position: "relative", zIndex: 3 }}>
        <img
          src={printerImg}
          alt=""
          width={1024}
          height={1024}
          style={{
            width: printerWidth,
            height: "auto",
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </div>

      {/* Receipt lane: absolutely anchored to the slot mouth. Content is
          clipped above the slot line by overflow:hidden on the outer div,
          and the inner motion.div translates from fully-hidden-above to 0. */}
      <div
        style={{
          position: "absolute",
          top: slotY,
          left: 0,
          right: 0,
          zIndex: 1,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            transform: `scale(${receiptScale})`,
            transformOrigin: "top center",
            width: receiptNaturalWidth,
          }}
        >
          <AnimatePresence initial={false}>
            {mode !== "idle" ? (
              <motion.div
                key="track"
                initial={{ maxHeight: 0 }}
                animate={{ maxHeight: 2400 }}
                exit={{ maxHeight: 0, opacity: 0 }}
                transition={{
                  duration: reduce ? 0.2 : mode === "printed" ? 0 : 3.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ overflow: "hidden" }}
              >
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
                    duration: reduce ? 0.2 : mode === "printed" ? 0 : 3.2,
                    ease: reduce ? "easeOut" : [0.22, 1, 0.36, 1],
                  }}
                  onAnimationComplete={() => {
                    if (mode === "printing") onPrintComplete?.();
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
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

      </div>

      {mode === "printing" ? (
        <div
          className="text-center mt-3 text-xs uppercase tracking-widest"
          style={{ color: "var(--ink-soft)" }}
        >
          printing…
        </div>
      ) : null}
    </div>
  );
}
