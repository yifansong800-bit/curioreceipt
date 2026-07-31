import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { ModeMark, type CurioMode } from "@/components/pixel-icons";
import { PrinterStage } from "@/components/printer-stage";
import snapDemo from "@/assets/snap-demo.jpg";

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.55)" }}
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
        className="relative w-full overflow-hidden"
        style={{
          maxWidth: 340,
          maxHeight: "88dvh",
          backgroundColor: BG[mode],
          color: INK[mode],
          border: "1px solid var(--ink)",
          boxShadow: "0 24px 48px -18px rgba(20,20,20,0.5)",
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

        <div className="flex flex-col items-center gap-5 overflow-y-auto px-5 py-7" style={{ maxHeight: "88dvh" }}>
          <ModeMark mode={mode} size={22} color={INK[mode]} />

          {mode === "snap" ? <SnapDemo /> : null}
          {mode === "log" ? <LogDemo /> : null}
          {mode === "share" ? <ShareDemo /> : null}

          <p className="text-center text-[11px] tracking-[0.18em]">{CAPTION[mode]}</p>

          <div className="flex items-center gap-2 pt-1">
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

/** The real printer feed animation with a mock receipt. */
function ShareDemo() {
  const [stage, setStage] = useState<"idle" | "printing" | "printed">("idle");
  useEffect(() => {
    const t = window.setTimeout(() => setStage("printing"), 500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (stage !== "printed") return;
    const t = window.setTimeout(() => setStage("idle"), 1400);
    const t2 = window.setTimeout(() => setStage("printing"), 1900);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [stage]);

  return (
    <div className="w-full" style={{ maxWidth: 260 }}>
      <PrinterStage mode={stage} onPrintComplete={() => setStage("printed")}>
        <div className="receipt-paper grain px-4 py-6 text-[9px] leading-relaxed" style={{ color: "var(--ink)", width: 360 }}>
          <div className="text-center tracking-widest">****** www.curioreceipt.com ******</div>
          <div className="mt-3">MUSEUM: M+</div>
          <div>LOCATION: HONG KONG</div>
          <div>CURATOR: CASSIE (SESH #11)</div>
          <Dashes />
          <div className="font-bold">
            01 <span className="italic">Gun</span> (2001) - Liu Ye
          </div>
          <Row label="★ MEDIUM" value="OIL ON CANVAS" />
          <Row label="★ LINGER TIME" value="2:45" />
          <div
            className="my-3"
            style={{
              height: 90,
              background:
                "repeating-conic-gradient(var(--ink) 0% 25%, transparent 0% 50%) 0 0 / 3px 3px",
              opacity: 0.55,
            }}
          />
          <Row label="I WAS..." value="[in awe] [moved]" />
          <Row label="RATING" value="★★★★☆" />
          <Dashes />
          <div className="text-center tracking-widest">THANK YOU FOR VISITING!</div>
        </div>
      </PrinterStage>
    </div>
  );
}
