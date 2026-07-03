import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import printerImg from "@/assets/printer.png";

type Mode = "idle" | "printing" | "printed";

// Measured from the generated bird's-eye printer PNG (1024x1024).
// Slot mouth (the black gap) sits ~72% down the image.
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

  return (
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
        {mode !== "idle" ? (
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
            {/* `zoom` scales BOTH visual size AND layout box, so the
                receipt occupies its scaled footprint in flow. */}
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
                  duration: reduce ? 0.25 : mode === "printed" ? 0 : 3.2,
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
  );
}
