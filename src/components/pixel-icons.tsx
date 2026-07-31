/**
 * The three Curio pixel marks, traced from the homepage sketch:
 *   SNAP  = thick plus
 *   LOG   = solid square
 *   SHARE = 3x3 dot grid
 * Rendered as SVG so they stay crisp at every size.
 */
type IconProps = { size?: number | string; className?: string; color?: string };

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
      <rect x="8.5" y="0" width="7" height="24" />
      <rect x="0" y="8.5" width="24" height="7" />
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
  const pos = [0, 9, 18];
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
        pos.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" />),
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
