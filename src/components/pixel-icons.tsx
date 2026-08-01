/**
 * The three Curio pixel marks, traced 1:1 from the reference artwork:
 *   SNAP  = plus with a hollow square at the centre
 *   LOG   = solid square
 *   SHARE = 3x3 dot grid
 * Rendered as SVG so they stay crisp at every size.
 */
type IconProps = { size?: number | string; className?: string; color?: string };

// Measured from the reference: arm thickness / hole = 4.88 of 24, arms 9.65 long.
const T = 4.88; // bar thickness
const A = 9.65; // arm length
const S = (24 - T) / 2; // bar start offset = 9.56
const E = S + T; // 14.44

export function SnapIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      aria-hidden
    >
      <rect x={S} y="0" width={T} height={A} />
      <rect x={S} y={24 - A} width={T} height={A} />
      <rect x="0" y={S} width={A} height={T} />
      <rect x={24 - A} y={S} width={A} height={T} />

    </svg>
  );
}

export function LogIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      aria-hidden
    >
      <rect x="0" y="0" width="24" height="24" />
    </svg>
  );
}

export function ShareIcon({ size = 24, className, color = "currentColor" }: IconProps) {
  // Reference: dot 4.8, gap 4.8 → positions 0 / 9.6 / 19.2
  const pos = [0, 9.6, 19.2];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      aria-hidden
    >
      {pos.map((y) =>
        pos.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4.8" height="4.8" />),
      )}
    </svg>
  );
}

export type CurioMode = "snap" | "log" | "share";

const ICONS = { snap: SnapIcon, log: LogIcon, share: ShareIcon } as const;

/**
 * The single pixel mark that identifies the current screen. Centred at the
 * top of every page, matching the demo designs.
 */
export function ModeMark({
  mode,
  size = 26,
  color = "var(--ink)",
  className = "",
}: {
  mode: CurioMode;
  size?: number;
  color?: string;
  className?: string;
}) {
  const Icon = ICONS[mode];
  return (
    <div className={`flex justify-center ${className}`} aria-label={mode}>
      <Icon size={size} color={color} />
    </div>
  );
}
