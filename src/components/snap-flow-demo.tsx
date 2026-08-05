import { useEffect, useState } from "react";
import liveClip from "@/assets/snap-live.mp4.asset.json";
import poster from "@/assets/snap-poster.jpg.asset.json";
import lovers from "@/assets/lovers-ii.jpg.asset.json";

/**
 * Looping walkthrough of the snap flow, for the homepage demo card:
 * live viewfinder → shutter → "want me to identify it?" → scanning → fields.
 * Purely illustrative; nothing is uploaded or identified for real.
 */

type Stage = "live" | "flash" | "offer" | "chosen" | "scanning" | "fields" | "done";

// Cumulative beats of the loop, in ms.
const BEATS: { stage: Stage; at: number }[] = [
  { stage: "live", at: 0 },
  { stage: "flash", at: 2200 },
  { stage: "offer", at: 2700 },
  { stage: "chosen", at: 4300 },
  { stage: "scanning", at: 4800 },
  { stage: "fields", at: 7600 },
  { stage: "done", at: 9600 },
];
const LOOP = 11800;

const THINKING = ["looking at the brushwork…", "checking the plaque…", "cross-referencing…"];

const FIELDS: [string, string][] = [
  ["TITLE", "The Lovers II"],
  ["ARTIST", "René Magritte"],
  ["YEAR", "1928"],
  ["MEDIUM", "Oil on canvas"],
  ["WHERE", "The Met, New York"],
];

const FRAME_BORDER = "1px solid rgba(20,20,20,0.35)";

export function SnapFlowDemo() {
  const [stage, setStage] = useState<Stage>("live");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const run = () => {
      BEATS.forEach((b) => {
        timers.push(window.setTimeout(() => setStage(b.stage), b.at));
      });
      timers.push(window.setTimeout(run, LOOP));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  // Rotating "thinking" lines while Curio looks.
  useEffect(() => {
    if (stage !== "scanning") return;
    setTick(0);
    const id = window.setInterval(() => setTick((t) => t + 1), 900);
    return () => window.clearInterval(id);
  }, [stage]);

  const captured = stage !== "live" && stage !== "flash";
  const shotTaken = stage === "flash";
  // The real artwork only appears once Curio has recognised it.
  const identified = stage === "fields" || stage === "done";

  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-3"
      style={{ maxWidth: 240, minHeight: 396 }}
    >
      {identified ? (
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "900 / 670", border: FRAME_BORDER }}
        >
          <img
            src={lovers.url}
            alt="The Lovers II by René Magritte"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        /* ── Viewfinder: live while framing, frozen still once snapped ── */
        <div
          className="relative w-full overflow-hidden"
          style={
            captured
              ? { height: 286, border: FRAME_BORDER }
              : { aspectRatio: "36 / 58", border: FRAME_BORDER }
          }
        >
          {/* First frame as a still, so the viewfinder is visible instantly on
              phones/Safari where the video needs a moment to decode. */}
          <img
            src={poster.url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          {captured ? null : (
            <video
              src={liveClip.url}
              poster={poster.url}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="relative h-full w-full object-cover"
              aria-hidden
            />
          )}
          {shotTaken ? (
            <div className="absolute inset-0" style={{ backgroundColor: "#fff" }} />
          ) : null}

          {stage === "scanning" ? (
            <>
              <div className="absolute inset-0" style={{ backgroundColor: "rgba(6,148,148,0.16)" }} />
              <div
                className="curio-scan absolute inset-x-0"
                style={{ height: 2, backgroundColor: "var(--teal)" }}
              />
            </>
          ) : null}

          {/* Shutter */}
          {captured ? null : (
            <div
              className="absolute inset-x-0 flex justify-center"
              style={{ bottom: 18 }}
              aria-hidden
            >
              <span
                className="flex items-center justify-center rounded-full transition-transform duration-200"
                style={{
                  width: 52,
                  height: 52,
                  border: "2px solid #F7F4EF",
                  backgroundColor: "transparent",
                  transform: shotTaken ? "scale(0.88)" : "scale(1)",
                }}
              >
                <span
                  className="rounded-full"
                  style={{ width: 40, height: 40, backgroundColor: "#F7F4EF" }}
                />
              </span>
            </div>
          )}
        </div>
      )}

      {/* Beat-specific copy */}
      {captured ? (
        <div
          className="flex w-full flex-col items-center justify-start gap-2 text-center"
          style={{ fontFamily: "var(--font-mono)", minHeight: 104 }}
        >
          {stage === "offer" || stage === "chosen" ? (
            <div className="curio-card-in w-full">
              <p className="mb-2 text-[10px] tracking-[0.16em]">want me to identify it?</p>
              <div className="flex justify-center gap-2">
                <span
                  className="border px-2 py-1 text-[9px] tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: "#141414",
                    backgroundColor: stage === "chosen" ? "#141414" : "transparent",
                    color: stage === "chosen" ? "var(--paper)" : "#141414",
                  }}
                >
                  yes, take a look ✦
                </span>
                <span
                  className="border px-2 py-1 text-[9px] tracking-[0.12em]"
                  style={{ borderColor: "#141414", opacity: 0.5 }}
                >
                  I'll type it
                </span>
              </div>
            </div>
          ) : null}

          {stage === "scanning" ? (
            <p className="text-[10px] tracking-[0.16em]">{THINKING[tick % THINKING.length]}</p>
          ) : null}

          {identified ? (
            <div className="w-full text-left">
              <p className="mb-1.5 text-[10px] tracking-[0.16em]">I think this is…</p>
              <div className="space-y-[3px]">
                {FIELDS.map(([label, value], i) => (
                  <div
                    key={label}
                    className="curio-card-in flex justify-between gap-2 text-[9px] tracking-[0.08em]"
                    style={{ animationDelay: `${i * 220}ms` }}
                  >
                    <span style={{ opacity: 0.55 }}>{label}</span>
                    <span className="truncate">{value}</span>
                  </div>
                ))}
              </div>
              {stage === "done" ? (
                <p
                  className="curio-card-in mt-2 inline-block border px-2 py-1 text-[9px] tracking-[0.12em]"
                  style={{ borderColor: "#141414" }}
                >
                  pretty sure ✦
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
