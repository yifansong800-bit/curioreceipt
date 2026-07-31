import type { CSSProperties } from "react";

export function Footer({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <footer
      className={`w-full py-4 text-center text-[10px] uppercase tracking-widest ${className ?? ""}`}
      style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)", ...style }}
    >
      © 2026 CURIO.
    </footer>
  );
}
