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

  const printerHeight = Math.round(printerWidth * HOUSING_RATIO);
  const slotY = (printerHeight * SLOT_Y_PCT) / 100;
  const pullUp = printerHeight - slotY;

  const receiptNaturalWidth = 360;
  const receiptScale = (printerWidth * (SLOT_WIDTH_PCT / 100)) / receiptNaturalWidth;

  // The housing is pure CSS, so there is nothing to wait on.
  const printerLoaded = true;

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
            onLoad={() => setPrinterLoaded(true)}
            ref={(el) => {
              // Handle cached images where onLoad may not fire.
              if (el && el.complete && el.naturalWidth > 0) setPrinterLoaded(true);
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
              >
                <div
                  style={{
                    position: "relative",
                    willChange: "transform",
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
  children,
}: {
  naturalWidth: number;
  scale: number;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setNaturalHeight(el.offsetHeight);
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

