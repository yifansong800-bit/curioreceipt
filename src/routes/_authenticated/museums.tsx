import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, ArrowUpRight, MapPin } from "lucide-react";
import { AppShell } from "@/components/collection/app-shell";
import { suggestMuseums } from "@/lib/visits.functions";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/museums")({
  head: () =>
    pageHead("Find a museum", "Find museums and galleries to add to your Curio want-to-go list."),
  component: Museums,
});
function Museums() {
  const suggest = useServerFn(suggestMuseums);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { name: string; city: string | null; country: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setBusy(true);
      try {
        const r = await suggest({ data: { query } });
        if (!cancelled) setResults(r.suggestions);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, suggest]);
  return (
    <AppShell>
      <Link to="/library" className="text-sm text-library-muted">
        ← Library
      </Link>
      <h1 className="collection-heading mt-8">Where next?</h1>
      <label className="museum-search">
        <Search size={20} />
        <input
          aria-label="Search museums"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Museum, gallery, city…"
        />
      </label>
      {busy ? (
        <p className="text-library-muted mt-8">looking…</p>
      ) : results.length ? (
        <ul className="museum-results">
          {results.map((m) => (
            <li key={m.name}>
              <Link
                to="/museum/$name"
                params={{ name: m.name }}
                search={{ city: m.city ?? undefined, country: m.country ?? undefined }}
              >
                <div>
                  <h2>{m.name}</h2>
                  <p>
                    <MapPin size={12} />
                    {[m.city, m.country].filter(Boolean).join(", ") || "Location unknown"}
                  </p>
                </div>
                <ArrowUpRight size={20} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-library-muted mt-12 text-sm">
          {query.length >= 2
            ? "no matches yet. try the museum’s name."
            : "somewhere familiar, or somewhere new."}
        </p>
      )}
    </AppShell>
  );
}
