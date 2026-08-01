import figureOpen from "@/assets/curio-figure-open.png.asset.json";
import figureWink from "@/assets/curio-figure-wink.png.asset.json";
import star from "@/assets/curio-star.png.asset.json";

/**
 * The Curio figure exactly as drawn: the open-eye frame with the winking
 * frame swapped in on a loop, so only the eye appears to move.
 */
export function CurioFigure({ className = "" }: { className?: string }) {
  return (
    <div className={`relative select-none ${className}`} style={{ aspectRatio: "470 / 554" }}>
      <img
        src={figureOpen.url}
        alt="Curio, a small yellow paper character"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <img
        src={figureWink.url}
        alt=""
        aria-hidden
        className="curio-wink absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <img
        src={star.url}
        alt=""
        aria-hidden
        className="absolute object-contain"
        style={{ width: "29%", right: "-22%", top: "-9%" }}
        draggable={false}
      />
    </div>
  );
}
