import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createVisit, suggestMuseums } from "@/lib/visits.functions";
import { getSessionId } from "@/lib/session";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curio — Museum Visit Receipt Generator" },
      {
        name: "description",
        content:
          "Turn your museum visit into a thermal receipt keepsake. Log the works you saw, how long you lingered, and how they made you feel.",
      },
      { property: "og:title", content: "Curio — Museum Visit Receipts" },
      {
        property: "og:description",
        content:
          "A little printable memento of every museum trip: artworks, lingers, and feelings on receipt paper.",
      },
    ],
  }),
  component: Index,
});

type Suggestion = { name: string; city: string | null; country: string | null };

function Index() {
  const navigate = useNavigate();
  const createFn = useServerFn(createVisit);
  const suggestFn = useServerFn(suggestMuseums);
  const [visitor, setVisitor] = useState("");
  const [museum, setMuseum] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const sessionId = getSessionId();
      return createFn({
        data: {
          sessionId,
          visitorName: visitor.trim(),
          museum: museum.trim(),
          city: picked?.city ?? null,
          country: picked?.country ?? null,
        },
      });
    },
    onSuccess: (visit) => {
      if (visit) navigate({ to: "/visit/$visitId", params: { visitId: visit.id } });
    },
  });

  const opening = mut.isPending || mut.isSuccess;
  const canSubmit = visitor.trim().length > 0 && museum.trim().length > 0 && !opening;

  return (
    <Dialog>
      <div
        className="relative h-[100dvh] overflow-hidden flex flex-col items-center justify-center pl-[max(2rem,env(safe-area-inset-left))] pr-[max(2rem,env(safe-area-inset-right))] sm:pl-[max(1.75rem,env(safe-area-inset-left))] sm:pr-[max(1.75rem,env(safe-area-inset-right))] sm:h-auto sm:min-h-screen"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="About Curio"
            className="absolute z-10 inline-flex items-center justify-center rounded-full border border-ink bg-paper p-2 text-ink transition-colors hover:bg-ink hover:text-paper"
            style={{
              top: "max(1rem, env(safe-area-inset-top))",
              right: "max(1rem, env(safe-area-inset-right))",
            }}
          >
            <Info className="h-5 w-5" />
          </button>
        </DialogTrigger>
        <div className="w-full max-w-md">
        <div
          className="text-center leading-none"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(48px, 14vw, 72px)",
            letterSpacing: 3,
          }}
        >
          CURIO
        </div>
        <p
          className="text-center mt-4 text-sm sm:text-base tracking-wide"
          style={{ color: "var(--ink-soft)" }}
        >
          ***** www.curioreceipt.com *****
        </p>
        <p className="text-center mt-6 text-xs sm:text-sm" style={{ color: "var(--ink-soft)" }}>
          A thermal receipt for your museum visit.
          <br />
          Log the works. Print the memory.
        </p>

        <form
          className="mt-10 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mut.mutate();
          }}
        >
          <Field
            label="YOUR NAME"
            value={visitor}
            onChange={setVisitor}
            placeholder="Michael Scott"
            maxLength={60}
          />
          <MuseumAutocomplete
            value={museum}
            onChange={(v) => {
              setMuseum(v);
              setPicked(null);
            }}
            onPick={(s) => {
              setMuseum(s.name);
              setPicked(s);
            }}
            picked={picked}
            suggest={suggestFn}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full uppercase tracking-widest text-sm py-3 border transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--ink)",
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            {opening ? "Opening receipt..." : "Begin visit →"}
          </button>
          {mut.isError ? (
            <p className="text-sm" style={{ color: "var(--destructive)" }}>
              Couldn't start visit. Try again.
            </p>
          ) : null}
        </form>
      </div>

      <Footer className="absolute bottom-0" />

      <DialogContent className="max-w-[calc(100%-4rem)] sm:max-w-md border text-left" style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)" }}>
        <DialogTitle className="text-lg tracking-tight">About Curio</DialogTitle>
        <div className="space-y-4 text-sm sm:text-base leading-relaxed" style={{ color: "var(--ink)" }}>
          <p>
            Curio helps art lovers and casual visitors log, save, and share memories of their favorite pieces — so they never get lost in a camera roll or Notes app.
          </p>
          <p>If you love it, share it. Let's keep our favorite art close.</p>
          <p style={{ color: "var(--ink-soft)" }}>
            Built with ♡ by{" "}
            <a
              href="https://cassiesong.lovable.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--ink)" }}
            >
              Cassie
            </a>{" "}
            (Northwestern ’29) on Lovable.
          </p>
          <p>
            <Link
              to="/privacy"
              className="text-[10px] uppercase tracking-widest underline"
              style={{ color: "var(--ink-soft)" }}
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </DialogContent>
    </div>
  </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <div
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-transparent border-b px-0 py-2 text-sm sm:text-base outline-none focus:border-b-2"
        style={{
          borderColor: "var(--ink)",
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
        }}
      />
    </label>
  );
}

function MuseumAutocomplete({
  value,
  onChange,
  onPick,
  picked,
  suggest,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
  picked: Suggestion | null;
  suggest: (opts: { data: { query: string } }) => Promise<{ suggestions: Suggestion[] }>;
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
      <div
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--ink-soft)" }}
      >
        MUSEUM VISITED
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
            <li
              className="px-3 py-2 text-xs uppercase tracking-widest"
              style={{ color: "var(--ink-soft)" }}
            >
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
                      style={{
                        color: isActive ? "var(--paper)" : "var(--ink-soft)",
                      }}
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
