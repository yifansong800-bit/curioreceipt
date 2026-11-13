import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { AppShell } from "@/components/collection/app-shell";
import { Button } from "@/components/ui/button";
import { collectionOptions } from "@/lib/collection-query";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/want-to-go")({
  head: () => pageHead("Want to go", "Museums and galleries you’re keeping for another day."),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: Want,
});
function Want() {
  const { data } = useSuspenseQuery(collectionOptions());
  return (
    <AppShell>
      <Link to="/library" className="text-sm text-library-muted">
        ← Library
      </Link>
      <h1 className="collection-heading mt-8">
        Want to go<span className="text-yellow">.</span>
      </h1>
      <p className="text-library-muted mt-3 text-sm">a few places for another day.</p>
      {data.bookmarks.length ? (
        <ul className="museum-results">
          {data.bookmarks.map((m) => (
            <li key={m.id}>
              <Link
                to="/museum/$name"
                params={{ name: m.name }}
                search={{ city: m.city ?? undefined, country: m.country ?? undefined }}
              >
                <div>
                  <h2>{m.name}</h2>
                  <p>{[m.city, m.country].filter(Boolean).join(", ")}</p>
                </div>
                <ArrowUpRight size={20} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className="library-empty">
          <Bookmark size={40} />
          <h2>Somewhere to look forward to.</h2>
          <Button className="bg-yellow text-ink mt-6" asChild>
            <Link to="/museums">Find a museum</Link>
          </Button>
        </section>
      )}
    </AppShell>
  );
}
