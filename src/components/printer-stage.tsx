import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import printerImg from "@/assets/printer.jpg";

type Mode = "idle" | "printing" | "printed";

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
  const printerWidth = 500;

  return (
    <div className="mx-auto" style={{ width: printerWidth }}>
      {/* Printer body */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <img
          src={printerImg}
          alt=""
          width={1024}
          height={768}
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

      {/* Receipt track: pulled up so its top edge aligns with the printer's
          paper-exit slot (slot sits ~75% down the printer image). */}
      <div
        style={{
          // 100% - 75% = 25% of image height = negative overlap
          marginTop: `calc(${printerWidth} * (768 / 1024) * -0.25)`,
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <AnimatePresence initial={false}>
          {mode !== "idle" ? (
            <motion.div
              key="track"
              // Track expands as receipt emerges so layout below reflows.
              initial={{ maxHeight: 0 }}
              animate={{ maxHeight: 2400 }}
              exit={{ maxHeight: 0, opacity: 0 }}
              transition={{
                duration: reduce ? 0.2 : mode === "printed" ? 0 : 3.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ overflow: "hidden", width: "100%" }}
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
                style={{ display: "flex", justifyContent: "center" }}
              >
                {/* Tiny stepper-motor jitter while printing */}
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
