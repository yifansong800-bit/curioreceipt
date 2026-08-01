import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { ModeMark, type CurioMode } from "@/components/pixel-icons";
import { PrinterStage } from "@/components/printer-stage";
import { SnapFlowDemo } from "@/components/snap-flow-demo";
import logDemo from "@/assets/log-demo.jpg.asset.json";
import demoReceipt from "@/assets/demo-receipt.png.asset.json";

const BG: Record<CurioMode, string> = {
  snap: "var(--ochre)",
  log: "var(--yellow)",
  share: "var(--teal)",
};

const CAPTION: Record<CurioMode, string> = {
  snap: "Snap the piece you couldn't walk past — I'll identify the art for you.",
  log: "Tell me what it made you think, feel, or question.",
  share: "I’ll print our little receipt—so you can share your memory with the world.",
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

          <div className="relative flex flex-1 items-center justify-center overflow-hidden pb-2 pt-5">
            <div key={mode} className="curio-card-in flex h-full w-full items-center justify-center">
              {mode === "snap" ? <SnapFlowDemo /> : null}
              {mode === "log" ? <LogDemo /> : null}
              {mode === "share" ? <ShareDemo /> : null}
            </div>
          </div>


          <div className="shrink-0">
            <p className="mx-auto max-w-[240px] text-center text-[11px] tracking-[0.18em]">{CAPTION[mode]}</p>

            <div className="flex items-center justify-center gap-2 pt-4">
              {ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`Show ${m} demo`}
                  onClick={() => onChange(m)}
                  className="h-2 w-2 transition-transform active:scale-90"
                  style={{
                    backgroundColor: m === mode ? INK[mode] : "transparent",
                    border: `1px solid ${INK[mode]}`,
                    touchAction: "manipulation",
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
/** Miniature proof sheet: types out the note, then flips the ink toggle. */
const NOTE_TEXT = "overwhelming but beautiful";

function LogDemo() {
  const [typed, setTyped] = useState(0);
  const [color, setColor] = useState(false);

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const run = () => {
      if (!alive) return;
      setTyped(0);
      setColor(false);
      for (let i = 1; i <= NOTE_TEXT.length; i++) {
        timers.push(window.setTimeout(() => alive && setTyped(i), 400 + i * 70));
      }
      const end = 400 + NOTE_TEXT.length * 70;
      timers.push(window.setTimeout(() => alive && setColor(true), end + 700));
      timers.push(window.setTimeout(() => alive && setColor(false), end + 2200));
      timers.push(window.setTimeout(run, end + 3400));
    };
    run();
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const done = typed >= NOTE_TEXT.length;

  return (
    <div className="w-full" style={{ maxWidth: 250 }}>
      <div className="receipt-paper grain px-4 py-5 text-[10px] leading-relaxed" style={{ color: "var(--ink)" }}>
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
          <span className="flex-1 text-right italic">
            “{NOTE_TEXT.slice(0, typed)}
            {done ? "" : <span style={{ opacity: 0.6 }}>|</span>}”
          </span>
        </div>
        <Dashes />

        {/* Crop / adjust strip */}
        <div className="flex items-center gap-3">
          <div
            className="flex shrink-0 items-center justify-center overflow-hidden"
            style={{ width: 88, height: 52, border: "1px solid var(--ink)" }}
          >
            <img
              src={logDemo.url}
              alt="Crop preview of the artwork"
              className="max-h-full max-w-full object-contain transition-[filter] duration-500"
              style={{ filter: color ? "none" : "grayscale(1) contrast(1.5)" }}
              loading="lazy"
            />
          </div>
          <div className="min-w-0">
            <div className="underline tracking-widest">CROP / ADJUST →</div>
            <div className="mt-1 opacity-70">this crop prints on the receipt</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="tracking-widest">INK</span>
          <span
            className="px-2 py-0.5 transition-colors duration-300"
            style={{
              border: "1px solid var(--ink)",
              backgroundColor: color ? "transparent" : "var(--ink)",
              color: color ? "var(--ink)" : "var(--paper)",
            }}
          >
            B&amp;W
          </span>
          <span
            className="px-2 py-0.5 transition-colors duration-300"
            style={{
              border: "1px solid var(--ink)",
              backgroundColor: color ? "var(--ink)" : "transparent",
              color: color ? "var(--paper)" : "var(--ink)",
            }}
          >
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
