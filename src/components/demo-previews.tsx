import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { ModeMark, type CurioMode } from "@/components/pixel-icons";
import { PrinterStage } from "@/components/printer-stage";
import snapDemo from "@/assets/snap-demo.jpg";
import demoReceipt from "@/assets/demo-receipt.png.asset.json";

const BG: Record<CurioMode, string> = {
  snap: "var(--ochre)",
  log: "var(--yellow)",
  share: "var(--teal)",
};

const CAPTION: Record<CurioMode, string> = {
  snap: "SNAP THE ART IN FRONT OF YOU",
  log: "LOG WHAT THE ART MEANT TO YOU",
  share: "SHARE YOUR MEMORY WITH THE WORLD",
};

const INK: Record<CurioMode, string> = {
  snap: "#141414",
  log: "#141414",
  share: "#141414",
};

const ORDER: CurioMode[] = ["snap", "log", "share"];

/**
 * Animated walkthrough of the three Curio modes. Purely illustrative —
 * no data is read or written.
 */
export function DemoPreview({
  mode,
  onChange,
  onClose,
}: {
  mode: CurioMode;
  onChange: (m: CurioMode) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        onChange(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
      if (e.key === "ArrowLeft")
        onChange(ORDER[(ORDER.indexOf(mode) + 2) % ORDER.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onChange, onClose]);

  const [touchX, setTouchX] = useState<number | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mode} demo`}
      className="curio-overlay-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.55)", touchAction: "manipulation" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchX === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
          if (Math.abs(dx) > 50) {
            const i = ORDER.indexOf(mode);
            onChange(ORDER[(i + (dx < 0 ? 1 : 2)) % ORDER.length]);
          }
          setTouchX(null);
        }}
        className="curio-card-in relative flex w-full flex-col overflow-hidden"
        style={{
          aspectRatio: "578 / 1026",
          maxWidth: 360,
          maxHeight: "92dvh",
          backgroundColor: BG[mode],
          color: INK[mode],
          border: "1px solid var(--ink)",
          boxShadow: "0 24px 48px -18px rgba(20,20,20,0.5)",
          transition: "background-color 240ms ease",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo"
          className="absolute right-2 top-2 z-10 p-2"
          style={{ color: INK[mode], touchAction: "manipulation" }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Fixed three-band layout so the mark and caption sit in exactly the
            same place in all three demos, whatever the content does. */}
        <div className="flex flex-1 flex-col overflow-hidden px-5 py-7">
          <div className="shrink-0">
            <ModeMark mode={mode} size={22} color={INK[mode]} />
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden py-5">
            <div className="flex h-full w-full items-center justify-center">
              {mode === "snap" ? <SnapDemo /> : null}
              {mode === "log" ? <LogDemo /> : null}
              {mode === "share" ? <ShareDemo /> : null}
            </div>
          </div>


          <div className="shrink-0">
            <p className="text-center text-[11px] tracking-[0.18em]">{CAPTION[mode]}</p>

            <div className="flex items-center justify-center gap-2 pt-4">
              {ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`Show ${m} demo`}
                  onClick={() => onChange(m)}
                  className="h-2 w-2"
                  style={{
                    backgroundColor: m === mode ? INK[mode] : "transparent",
                    border: `1px solid ${INK[mode]}`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/** Wobbly hand-drawn frame + a shutter that closes on a loop. */
function SnapDemo() {
  const [shot, setShot] = useState(false);
  useEffect(() => {
    let alive = true;
    const loop = () => {
      window.setTimeout(() => {
        if (!alive) return;
        setShot(true);
        window.setTimeout(() => {
          if (!alive) return;
          setShot(false);
          loop();
        }, 700);
      }, 1800);
    };
    loop();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="relative w-full" style={{ maxWidth: 240 }}>
        <div className="relative overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
          <img
            src={snapDemo}
            alt="Sample artwork framed in the Curio camera"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* Shutter blades closing */}
          <div
            className="absolute inset-x-0 top-0 transition-transform duration-300 ease-out"
            style={{
              height: "50%",
              backgroundColor: "#141414",
              transform: shot ? "translateY(0)" : "translateY(-100%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 transition-transform duration-300 ease-out"
            style={{
              height: "50%",
              backgroundColor: "#141414",
              transform: shot ? "translateY(0)" : "translateY(100%)",
            }}
          />
        </div>
        <SketchFrame />
      </div>

      <div
        className="rounded-full transition-transform duration-200"
        style={{
          width: 54,
          height: 54,
          border: "3px solid #141414",
          transform: shot ? "scale(0.88)" : "scale(1)",
        }}
      />
    </div>
  );
}

/** Loose ink rectangle traced over the photo, as in the sketch. */
function SketchFrame() {
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ inset: "-9px" }}
      viewBox="0 0 100 124"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M4 6 C 26 3, 62 5, 96 3 C 97 34, 95 78, 97 120 C 66 118, 34 121, 3 119 C 5 84, 2 42, 4 6 Z"
        fill="none"
        stroke="#141414"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Miniature proof sheet, matching the log-mode design. */
function LogDemo() {
  return (
    <div className="w-full" style={{ maxWidth: 250 }}>
      <div className="receipt-paper grain px-4 py-6 text-[10px] leading-relaxed" style={{ color: "var(--ink)" }}>
        <div className="text-center tracking-widest">****** RECEIPT DRAFT ******</div>
        <Dashes />
        <div className="font-bold">
          01 <span className="italic">Gun</span> (2001) — Liu Ye
        </div>
        <Row label="★ MEDIUM" value="OIL ON CANVAS" />
        <Row label="★ LINGER TIME" value="2:45" />
        <Dashes />
        <Row label="I WAS..." value="[in awe] [moved]" />
        <Row label="RATING" value="★★★★☆" />
        <div className="mt-1 flex gap-2">
          <span>NOTE</span>
          <span className="flex-1 text-right italic">“overwhelming but beautiful”</span>
        </div>
        <Dashes />
        <div className="flex items-center gap-2">
          <span className="tracking-widest">INK</span>
          <span className="px-2 py-0.5" style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}>
            B&amp;W
          </span>
          <span className="border px-2 py-0.5" style={{ borderColor: "var(--ink)" }}>
            COLOR
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Dashes() {
  return (
    <div className="my-2 overflow-hidden whitespace-nowrap opacity-70">
      - - - - - - - - - - - - - - - - - - - -
    </div>
  );
}

/** The real printer, looping the stepped feed animation. */
function ShareDemo() {
  const [phase, setPhase] = useState<"idle" | "printing" | "printed">("idle");
  useEffect(() => {
    let alive = true;
    const start = window.setTimeout(() => alive && setPhase("printing"), 400);
    return () => {
      alive = false;
      window.clearTimeout(start);
    };
  }, []);

  return (
    // Top-anchored so the printer stays put while the receipt feeds downward.
    <div className="flex h-full w-full flex-col items-center justify-start self-start overflow-hidden">
      <div className="w-full" style={{ maxWidth: 240 }}>
        <PrinterStage
          mode={phase}
          feedDurationMs={3200}
          onPrintComplete={() => setPhase("printed")}
        >
          <img
            src={demoReceipt.url}
            alt="Example Curio receipt"
            style={{ width: 360, display: "block" }}
          />
        </PrinterStage>
      </div>
    </div>
  );

}
