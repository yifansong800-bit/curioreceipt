import type { CurioMode } from "@/components/pixel-icons";
import { SnapIcon, LogIcon, ShareIcon } from "@/components/pixel-icons";

// Outline vectorized from the original Curio sketch so it stays crisp at any
// size. Icons + captions are drawn live (not baked into the artwork).
const BODY_PATHS = [
  "M1846 3774 c-61 -22 -72 -38 -80 -106 -7 -74 -6 -73 -43 -52 -72 42 -105 -7 -187 -281 -91 -301 -72 -429 66 -451 47 -8 51 -23 46 -206 -4 -181 6 -173 -219 -182 -279 -11 -526 -62 -689 -143 -184 -92 -329 -275 -573 -723 -54 -99 -93 -245 -103 -379 -22 -316 280 -713 701 -924 220 -109 541 -180 1055 -232 170 -17 233 -14 328 17 35 11 64 18 66 17 1 -2 6 -17 12 -34 14 -45 53 -50 308 -37 482 24 673 83 1016 310 358 237 547 423 655 645 117 243 127 415 35 613 -83 180 -154 254 -404 423 -247 166 -466 287 -652 361 -160 64 -551 150 -680 150 -35 0 -64 2 -64 4 0 2 -12 59 -26 127 -24 117 -26 146 -32 521 -8 455 -1 421 -108 493 -115 78 -316 110 -428 69z m164 -76 c-19 -5 -57 -18 -83 -28 -42 -16 -49 -17 -54 -4 -11 30 20 42 112 42 56 0 58 -1 25 -10z m178 -44 c98 -48 117 -81 71 -124 -18 -16 -45 -34 -60 -39 l-27 -9 5 57 c6 63 -16 102 -82 143 -47 30 3 15 93 -28z m-140 0 c42 -12 22 -24 -40 -24 -60 1 -62 1 -38 15 28 16 44 18 78 9z m-163 -99 c22 -8 75 -14 118 -15 l77 0 0 -31 0 -32 -66 6 c-75 7 -174 48 -174 71 0 19 -4 19 45 1z m-47 -109 c119 -60 317 -73 412 -27 l40 19 0 -91 c1 -217 21 -568 38 -664 l18 -103 -56 -45 c-128 -104 -245 -119 -461 -57 l-116 34 10 51 c5 29 7 124 4 212 -5 157 -6 160 -31 182 -22 19 -34 22 -70 17 -39 -6 -45 -4 -56 16 -27 50 17 247 115 528 3 9 15 6 43 -12 21 -13 70 -40 110 -60z m952 -1005 c314 -62 579 -174 910 -384 276 -175 375 -268 450 -422 100 -207 96 -361 -15 -590 -101 -208 -286 -385 -665 -639 -307 -206 -471 -251 -948 -262 -210 -4 -234 -3 -206 9 17 8 46 37 66 64 48 67 127 106 363 182 201 64 399 138 440 165 32 21 34 70 5 86 -15 8 -30 5 -71 -15 -85 -43 -244 -102 -433 -161 -184 -57 -230 -76 -305 -127 -42 -28 -44 -29 -54 -11 -55 99 -256 226 -472 301 -61 21 -81 23 -156 17 -101 -7 -168 8 -239 56 -50 33 -81 38 -100 15 -22 -27 -3 -64 53 -99 85 -55 134 -67 265 -65 106 1 123 -1 182 -26 222 -92 409 -220 384 -262 -16 -27 -121 -81 -184 -94 -63 -13 -206 -4 -556 36 -505 58 -792 174 -1045 424 -427 423 -421 712 25 1366 219 321 432 411 991 417 l240 3 85 -28 c66 -23 110 -30 201 -34 141 -7 195 7 299 74 l73 48 131 -7 c81 -4 190 -18 286 -37z",
  "M1840 3248 c-78 -40 -90 -57 -67 -92 55 -84 218 -115 331 -63 62 28 80 54 71 98 -20 90 -208 122 -335 57z m235 -61 c17 -13 17 -14 -3 -19 -14 -4 -22 0 -25 13 -6 22 2 24 28 6z m-142 -17 c6 -23 -2 -25 -38 -8 -18 8 -22 14 -13 20 23 14 46 9 51 -12z",
];

const SPOTS: { mode: CurioMode; label: string; cx: number }[] = [
  { mode: "snap", label: "SNAP", cx: 112.5 },
  { mode: "log", label: "LOG", cx: 203 },
  { mode: "share", label: "SHARE", cx: 297 },
];

const ICONS = { snap: SnapIcon, log: LogIcon, share: ShareIcon } as const;

// Geometry measured from the source sketch (435 x 386 units).
const ICON_SIZE = 43;
const ICON_TOP = 219;
const CAPTION_Y = 285;

export function CurioDoodle({ onPick }: { onPick: (mode: CurioMode) => void }) {
  return (
    <div className="relative mx-auto w-full select-none" style={{ aspectRatio: "435 / 386" }}>
      <svg
        viewBox="0 0 435 386"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Curio figure holding the snap, log and share tools"
      >
        <g transform="translate(0,386) scale(0.1,-0.1)" fill="var(--ink)" stroke="none">
          {BODY_PATHS.map((d) => (
            <path key={d.slice(0, 24)} d={d} />
          ))}
        </g>
        {SPOTS.map(({ label, cx }) => (
          <text
            key={label}
            x={cx}
            y={CAPTION_Y}
            textAnchor="middle"
            fill="var(--ink)"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {label}
          </text>
        ))}
      </svg>

      {SPOTS.map(({ mode, label, cx }) => {
        const Icon = ICONS[mode];
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onPick(mode)}
            aria-label={`See how ${label.toLowerCase()} works`}
            className="absolute flex items-center justify-center transition-transform duration-150 active:scale-95"
            style={{
              left: pct(cx - ICON_SIZE, 435),
              top: pct(ICON_TOP - 10, 386),
              width: pct(ICON_SIZE * 2, 435),
              height: pct(ICON_SIZE + 20, 386),
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              background: "transparent",
            }}
          >
            <Icon size="50%" color="var(--ink)" />
          </button>
        );
      })}
    </div>
  );
}

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}
