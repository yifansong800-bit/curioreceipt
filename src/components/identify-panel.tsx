import { useEffect, useState } from "react";

/**
 * Curio's identification moment: a photo being "read", and the result it
 * comes back with. Kept separate from the piece form so the form stays
 * about fields and this stays about the little bit of magic.
 */

export type IdentifyResult = {
  title: string;
  artist: string;
  year: string;
  medium: string;
  confident: boolean;
};

const THINKING_LINES = [
  "looking at the brushwork…",
  "reading the plaque…",
  "cross-referencing…",
  "almost sure now…",
];

/** The uploaded photo with a scanning sweep while Curio thinks. */
export function ScanThumb({
  src,
  scanning,
  size = 72,
}: {
  src: string;
  scanning: boolean;
  size?: number;
}) {
  return (
    <div
      className="relative overflow-hidden shrink-0"
      style={{ width: size, height: size, backgroundColor: "var(--ink)" }}
    >
      <img src={src} alt="" className="h-full w-full object-cover" />
      {scanning ? (
        <>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "color-mix(in oklab, var(--teal) 22%, transparent)" }}
          />
          <div className="curio-scan absolute left-0 right-0" style={{ height: 2, backgroundColor: "var(--teal)" }} />
        </>
      ) : null}
    </div>
  );
}

/** Rotating first-person status lines while the call is in flight. */
export function ThinkingLines() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % THINKING_LINES.length), 1600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span style={{ fontStyle: "italic" }} aria-live="polite">
      {THINKING_LINES[i]}
    </span>
  );
}

/** "I think this is…" — the result card, with confidence and per-line edits. */
export function IdentifyResultCard({
  result,
  onAccept,
  onDismiss,
  onRetry,
}: {
  result: IdentifyResult;
  onAccept: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "TITLE", value: result.title },
    { label: "ARTIST", value: result.artist },
    { label: "YEAR", value: result.year },
    { label: "MEDIUM", value: result.medium },
  ];

  return (
    <div
      className="receipt-paper grain p-4 space-y-3"
      style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">I think this is…</span>
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--ink-soft)" }}
        >
          {result.confident ? "✦ pretty sure" : "✦ a guess — check me"}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2">
            <span
              className="text-[10px] uppercase tracking-widest w-16 shrink-0 pt-1"
              style={{ color: "var(--ink-soft)" }}
            >
              {r.label}
            </span>
            <span style={r.value ? undefined : { color: "var(--ink-soft)", fontStyle: "italic" }}>
              {r.value || "you tell me"}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onAccept}
          className="flex-1 text-xs uppercase tracking-widest py-2 border"
          style={{
            borderColor: "var(--ink)",
            backgroundColor: "var(--teal)",
            color: "var(--yellow)",
            touchAction: "manipulation",
          }}
        >
          yes, that's it
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 text-xs uppercase tracking-widest py-2 border"
          style={{ borderColor: "var(--ink)", color: "var(--ink)", touchAction: "manipulation" }}
        >
          no, I'll type it
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] underline"
          style={{ color: "var(--ink-soft)" }}
        >
          ✦ take another look
        </button>
      </div>
    </div>
  );
}
