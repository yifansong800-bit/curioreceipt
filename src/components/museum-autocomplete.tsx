import { useEffect, useMemo, useRef, useState } from "react";

export type Suggestion = { name: string; city: string | null; country: string | null };

export function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  autoFocus,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className="w-full bg-transparent border-b px-0 py-2 text-sm sm:text-base outline-none transition-colors focus:border-b-2"
        style={{
          borderColor: "var(--ink)",
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
        }}
      />
    </label>
  );
}

export function MuseumAutocomplete({
  value,
  onChange,
  onPick,
  picked,
  suggest,
  label = "MUSEUM VISITED",
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
  picked: Suggestion | null;
  suggest: (opts: { data: { query: string } }) => Promise<{ suggestions: Suggestion[] }>;
  label?: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reqRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const q = value.trim();
  const shouldSearch = q.length >= 2 && !picked;

  useEffect(() => {
    if (!shouldSearch) {
      setItems([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await suggest({ data: { query: q } });
        if (reqRef.current !== myReq) return;
        setItems(res.suggestions ?? []);
        setActive(0);
      } catch {
        if (reqRef.current !== myReq) return;
        setItems([]);
      } finally {
        if (reqRef.current === myReq) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, shouldSearch, suggest]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showList = open && shouldSearch && (loading || items.length > 0);

  const locationLabel = useMemo(() => {
    if (!picked) return null;
    const parts = [picked.city, picked.country].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }, [picked]);

  return (
    <div className="relative" ref={wrapRef}>
      <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(items.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            onPick(items[active]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="e.g. The Art Institute of Chicago"
        maxLength={80}
        autoComplete="off"
        className="w-full bg-transparent border-b px-0 py-2 text-sm sm:text-base outline-none focus:border-b-2"
        style={{
          borderColor: "var(--ink)",
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
        }}
      />
      {locationLabel ? (
        <div
          className="text-xs mt-1 uppercase tracking-widest"
          style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}
        >
          ↳ {locationLabel}
        </div>
      ) : null}
      {showList ? (
        <ul
          className="absolute left-0 right-0 z-20 mt-1 border max-h-72 overflow-auto"
          style={{
            backgroundColor: "var(--paper)",
            borderColor: "var(--ink)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {loading && items.length === 0 ? (
            <li className="px-3 py-2 text-xs uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
              searching…
            </li>
          ) : null}
          {items.map((s, i) => {
            const loc = [s.city, s.country].filter(Boolean).join(", ");
            const isActive = i === active;
            return (
              <li key={`${s.name}-${i}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(s);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm"
                  style={{
                    backgroundColor: isActive ? "var(--ink)" : "transparent",
                    color: isActive ? "var(--paper)" : "var(--ink)",
                  }}
                >
                  <div className="truncate">{s.name}</div>
                  {loc ? (
                    <div
                      className="text-[10px] uppercase tracking-widest mt-0.5 truncate"
                      style={{ color: isActive ? "var(--paper)" : "var(--ink-soft)" }}
                    >
                      {loc}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
