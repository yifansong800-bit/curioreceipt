import doodleAsset from "@/assets/curio-doodle.png.asset.json";
import { LogIcon, ShareIcon, SnapIcon, type CurioMode } from "@/components/pixel-icons";

// Positions measured against the source sketch (percentages of the doodle box).
const SPOTS: { mode: CurioMode; label: string; left: number }[] = [
  { mode: "snap", label: "SNAP", left: 25.6 },
  { mode: "log", label: "LOG", left: 46.8 },
  { mode: "share", label: "SHARE", left: 68.3 },
];
const ICON_TOP = 62.2;
const CAPTION_TOP = 73;

const ICONS = { snap: SnapIcon, log: LogIcon, share: ShareIcon } as const;

/**
 * The hand-drawn Curio figure from the homepage design, with the three
 * pixel marks placed back inside it as tappable buttons.
 */
export function CurioDoodle({ onPick }: { onPick: (mode: CurioMode) => void }) {
  return (
    <div
      className="relative mx-auto w-full select-none"
      style={{ aspectRatio: "511 / 453" }}
    >
      <img
        src={doodleAsset.url}
        alt="Curio figure holding the snap, log and share tools"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {SPOTS.map(({ mode, label, left }) => {
        const Icon = ICONS[mode];
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onPick(mode)}
            aria-label={`See how ${label.toLowerCase()} works`}
            className="absolute flex flex-col items-center transition-transform duration-150 hover:scale-110 active:scale-95"
            style={{
              left: `${left}%`,
              top: `${ICON_TOP}%`,
              transform: "translate(-50%, -50%)",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              color: "var(--ink)",
            }}
          >
            <div style={{ width: "9.4vw", maxWidth: 48 }}>
              <Icon size={undefined as unknown as number} className="h-auto w-full" />
            </div>
          </button>
        );
      })}
      {SPOTS.map(({ mode, label, left }) => (
        <div
          key={`${mode}-label`}
          className="pointer-events-none absolute text-[10px] tracking-widest sm:text-xs"
          style={{
            left: `${left}%`,
            top: `${CAPTION_TOP}%`,
            transform: "translate(-50%, -50%)",
            color: "var(--ink)",
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
