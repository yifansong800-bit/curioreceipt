export function StarRating({
  value,
  onChange,
  size = "text-2xl",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const full = value >= n;
        const half = !full && value >= n - 0.5;
        return (
          <span key={n} className={`relative inline-flex leading-none px-1 ${size}`}>
            <span
              aria-hidden
              style={{ color: "var(--ink)", opacity: full ? 1 : 0.25 }}
            >
              {"\u2605"}
            </span>
            {half ? (
              <span
                aria-hidden
                className="absolute inset-0 overflow-hidden pointer-events-none px-1"
                style={{ width: "50%", color: "var(--ink)" }}
              >
                {"\u2605"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(value === n - 0.5 ? 0 : n - 0.5)}
              aria-label={`${n - 0.5} stars`}
              className="absolute inset-y-0 left-0 w-1/2"
              style={{ touchAction: "manipulation" }}
            />
            <button
              type="button"
              onClick={() => onChange(value === n ? 0 : n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="absolute inset-y-0 right-0 w-1/2"
              style={{ touchAction: "manipulation" }}
            />
          </span>
        );
      })}
      {value > 0 ? (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-2 text-xs uppercase tracking-widest underline"
          style={{ color: "var(--ink-soft)" }}
        >
          clear
        </button>
      ) : null}
    </div>
  );
}
