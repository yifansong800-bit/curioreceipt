// ============================================================
// The printer housing is drawn in CSS to replicate the flat
// white unit in the Curio design: a rounded slab with a dark
// output slot that the receipt feeds out of.
// SLOT_Y_PCT / SLOT_WIDTH_PCT are measured against that design.
// ============================================================
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Mode = "idle" | "printing" | "printed";

// Housing proportions, measured from the printing-page design.
const HOUSING_RATIO = 0.196; // height / width
const SLOT_Y_PCT = 44; // % of housing height
const SLOT_WIDTH_PCT = 86; // % of housing width
const MAX_PRINTER_WIDTH = 460;

// Stepped feed: 8 discrete "clicks" ≈ 1 inch each.
const FEED_STEPS = 8;
const FEED_DURATION_MS = 8000;

export function PrinterStage({
  mode,
  onPrintComplete,
  feedDurationMs: feedDurationOverride,
  availableHeight,
  children,
}: {
  mode: Mode;
  /** Retained for API compatibility; no longer rendered. */
  warmupDuration?: number;
  onPrintComplete?: () => void;
  /** Override the stepped feed duration (used by the homepage demo). */
  feedDurationMs?: number;
  /** When set, the printer + receipt are scaled to fit within this pixel height. */
  availableHeight?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const feedMs = feedDurationOverride ?? FEED_DURATION_MS;


  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Measured synchronously before paint so the housing never renders at the
  // fallback max width first and then snaps down (that jump read as a glitch).
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [receiptNaturalHeight, setReceiptNaturalHeight] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      // clientWidth is the untransformed layout width. getBoundingClientRect()
      // would include any ancestor scale (e.g. the card entrance animation),
      // which made the printer render small and then jump larger mid-animation.
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(Math.min(MAX_PRINTER_WIDTH, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const receiptNaturalWidth = 360;

  // Total rendered height is linear in printer width:
  //   housing visible part = w * HOUSING_RATIO * (SLOT_Y_PCT/100)
  //   receipt              = receiptHeight * (w * SLOT_WIDTH_PCT/100) / 360
  let printerWidth = containerWidth;
  if (availableHeight && availableHeight > 0 && receiptNaturalHeight > 0 && containerWidth > 0) {
    const k =
      HOUSING_RATIO * (SLOT_Y_PCT / 100) +
      (receiptNaturalHeight * (SLOT_WIDTH_PCT / 100)) / receiptNaturalWidth;
    // 0.92 safety margin: the receipt keeps growing while dithered images
    // decode, so leave headroom rather than fitting to the pixel.
    const fitWidth = Math.floor((availableHeight * 0.92) / k);
    printerWidth = Math.max(120, Math.min(containerWidth, fitWidth));
  }

  const measured = containerWidth > 0;

  const printerHeight = Math.round(printerWidth * HOUSING_RATIO);
  const slotY = (printerHeight * SLOT_Y_PCT) / 100;
  const pullUp = printerHeight - slotY;

  const receiptScale = (printerWidth * (SLOT_WIDTH_PCT / 100)) / receiptNaturalWidth;


  // The housing is pure CSS, so there is nothing to wait on.
  const printerLoaded = measured;

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
    if (!printerLoaded) {
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
  }, [mode, printerLoaded]);

  // Unlock Download exactly when the stepped feed animation ends.
  const feedDurationMs = reduce ? 250 : feedMs;
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

      <div
        className="mx-auto flex flex-col items-center"
        style={{ width: printerWidth, visibility: measured ? "visible" : "hidden" }}
      >
        {/* Flat printer housing, drawn to match the design. */}
        <div
          style={{
            width: printerWidth,
            height: printerHeight,
            position: "relative",
            zIndex: 1,
            isolation: "isolate",
            borderRadius: `${Math.round(printerWidth * 0.028)}px ${Math.round(printerWidth * 0.028)}px ${Math.round(printerWidth * 0.012)}px ${Math.round(printerWidth * 0.012)}px`,
            background:
              "linear-gradient(180deg, #fdfdfd 0%, #f4f4f4 38%, #e6e6e6 62%, #f7f7f7 82%, #ededed 100%)",
            boxShadow:
              "0 14px 26px -12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          {/* Output slot */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: slotY,
              left: `${(100 - SLOT_WIDTH_PCT) / 2}%`,
              width: `${SLOT_WIDTH_PCT}%`,
              height: Math.max(3, Math.round(printerWidth * 0.008)),
              backgroundColor: "#1d1d1d",
              borderRadius: 1,
              boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
            }}
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
              <ScaledReceipt
                naturalWidth={receiptNaturalWidth}
                scale={receiptScale}
                onNaturalHeight={setReceiptNaturalHeight}
              >

                <div
                  style={{
                    position: "relative",
                    willChange: "transform",
                    transform: mode === "printed" ? "translateY(0)" : "translateY(-100%)",
                    visibility: armed ? "visible" : "hidden",
                    ...(mode === "printing" && armed && !reduce
                      ? {
                          animation: `curio-feed ${feedMs}ms steps(${FEED_STEPS}, end) forwards`,
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
              </ScaledReceipt>



            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Renders the receipt at its natural width (so text wraps identically to
 * desktop and html-to-image can snapshot at full resolution) but visually
 * scaled down to fit the printer slot on smaller screens.
 *
 * Uses `transform: scale()` with `transform-origin: top left` so the layout
 * box stays 360px wide internally, while a wrapper reserves the correct
 * scaled footprint (width + height) so the printer + receipt stay centered
 * and no content overflows the slot.
 */
function ScaledReceipt({
  naturalWidth,
  scale,
  onNaturalHeight,
  children,
}: {
  naturalWidth: number;
  scale: number;
  onNaturalHeight?: (h: number) => void;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const notifyRef = useRef(onNaturalHeight);
  notifyRef.current = onNaturalHeight;
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      setNaturalHeight(h);
      notifyRef.current?.(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        width: naturalWidth * scale,
        height: naturalHeight * scale,
        position: "relative",
        overflow: "visible",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: naturalWidth,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

