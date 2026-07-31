import doodleAsset from "@/assets/curio-doodle-2.png.asset.json";
import type { CurioMode } from "@/components/pixel-icons";

// Positions measured against the source sketch (percentages of the doodle box).
const SPOTS: { mode: CurioMode; label: string; left: number }[] = [
  { mode: "snap", label: "SNAP", left: 25.7 },
  { mode: "log", label: "LOG", left: 46.9 },
  { mode: "share", label: "SHARE", left: 68.3 },
];
const HIT_TOP = 65;

/**
 * The hand-drawn Curio figure from the homepage design (icons and captions
 * are part of the artwork); invisible hit areas make each mark tappable.
 */
export function CurioDoodle({ onPick }: { onPick: (mode: CurioMode) => void }) {
  return (
    <div
      className="relative mx-auto w-full select-none"
      style={{ aspectRatio: "435 / 386" }}
    >
      <img
        src={doodleAsset.url}
        alt="Curio figure holding the snap, log and share tools"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {SPOTS.map(({ mode, label, left }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onPick(mode)}
          aria-label={`See how ${label.toLowerCase()} works`}
          className="absolute transition-transform duration-150 active:scale-95"
          style={{
            left: `${left}%`,
            top: `${HIT_TOP}%`,
            width: "20%",
            height: "26%",
            transform: "translate(-50%, -50%)",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
            background: "transparent",
          }}
        />
      ))}
    </div>
  );
}
