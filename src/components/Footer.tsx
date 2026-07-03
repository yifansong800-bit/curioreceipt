export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={`w-full py-4 text-center text-[10px] uppercase tracking-widest ${className ?? ""}`}
      style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}
    >
      © 2026 CURIO.
    </footer>
  );
}
