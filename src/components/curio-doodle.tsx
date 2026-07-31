import type { CurioMode } from "@/components/pixel-icons";
import { SnapIcon, LogIcon, ShareIcon } from "@/components/pixel-icons";

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

/**
 * Hand-drawn Curio figure, redrawn as thin sketch strokes so it reads as ink on
 * paper (matching the wordmark) instead of a heavy filled silhouette.
 * The two arms make a camera-frame gesture around the SNAP / LOG / SHARE icons.
 */
export function CurioDoodle({ onPick }: { onPick: (mode: CurioMode) => void }) {
  return (
    <div className="relative mx-auto w-full select-none" style={{ aspectRatio: "435 / 386" }}>
      <svg
        viewBox="0 0 435 386"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Curio figure framing the snap, log and share tools"
      >
        <g
          fill="none"
          stroke="var(--ink)"
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Head — paper-roll block, left profile with nose notch */}
          <path d="M184 44 C181 62 179 78 178 93 C176 96 172 97 172 99 C173 103 182 103 187 106 C186 116 187 127 186 135 C199 139 222 142 249 143 C254 141 256 136 256 130 C255 105 253 74 248 50" />
          {/* Rolled top of the head */}
          <path d="M184 44 C186 34 197 26 214 24 C233 22 247 30 249 41 C250 45 249 48 248 50" />
          <path d="M196 33 C201 27 213 24 224 26 C235 28 240 34 237 40 C233 46 220 48 209 45 C201 43 196 38 196 33 Z" />
          <path d="M199 40 C205 44 217 46 228 44" />

          {/* Eye — small ink wedge, blinks while the visitor lingers */}
          <g className="curio-blink" style={{ transformOrigin: "212px 83px" }}>
            <path d="M220 76 C214 79 209 81 203 83 C209 85 214 86 220 88" strokeWidth={3.8} />
          </g>

          {/* Right arm sweeping out from the shoulder */}
          <path d="M256 130 C284 126 320 126 352 133 C382 140 400 152 402 167" />
          {/* Right hand, fingers folded, thumb dropping down */}
          <path d="M402 167 C400 186 391 205 375 218 C365 226 355 229 350 224 C346 219 348 209 352 199" />
          <path d="M352 199 C340 202 318 204 300 202 C288 200 282 196 283 191 C285 185 296 182 310 182" />
          <path d="M292 191 C306 190 322 188 337 186" />
          <path d="M294 183 C308 181 324 179 338 178" />
          <path d="M300 176 C314 173 330 171 344 171" />

          {/* Left arm rising from the lower-left corner */}
          <path d="M50 240 C44 268 43 300 50 320 C55 333 66 338 84 339 C104 340 126 338 143 335" />
          {/* Left hand, thumb up, fingers pointing right */}
          <path d="M75 336 C90 331 105 322 115 306 C119 299 123 296 126 299 C129 303 128 313 124 320" />
          <path d="M124 320 C138 316 152 313 165 312 C172 312 176 315 174 319 C172 324 162 327 150 329" />
          <path d="M139 320 C150 322 160 324 168 327" />
          <path d="M136 327 C146 329 156 331 164 334" />
          <path d="M130 333 C140 336 150 338 158 340" />
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
