import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, MapPin, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/collection/app-shell";
import { Button } from "@/components/ui/button";
import { collectionOptions } from "@/lib/collection-query";
import { toggleBookmark } from "@/lib/collection.functions";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/museum/$name")({
  head: () =>
    pageHead("Your museum notebook", "Your visits and want-to-go bookmark for this museum."),
  validateSearch: (s: Record<string, unknown>): { city?: string; country?: string } => ({
    city: typeof s.city === "string" ? s.city : undefined,
    country: typeof s.country === "string" ? s.country : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: Museum,
});
function Museum() {
  const { name } = Route.useParams();
  const { city, country } = Route.useSearch();
  const { data } = useSuspenseQuery(collectionOptions());
  const qc = useQueryClient();
  const toggle = useServerFn(toggleBookmark);
  const bookmarked = data.bookmarks.some((b) => b.name === name);
  const entries = data.entries.filter((e) => e.snapshot.museum === name && e.status === "saved");
  return (
    <AppShell>
      <Link to="/museums" className="text-sm text-library-muted">
        ← Museums
      </Link>
      <p className="collection-eyebrow mt-12">MUSEUM NOTEBOOK</p>
      <h1 className="collection-heading break-words">{name}</h1>
      <p className="flex items-center gap-2 mt-4 text-library-muted text-sm">
        <MapPin size={16} />
        {[city, country].filter(Boolean).join(", ") || "Location unknown"}
      </p>
      <Button
        variant="outline"
        className="mt-8 bg-transparent text-library-fg border-library-line"
        onClick={async () => {
          try {
            await toggle({
              data: { name, city: city ?? null, country: country ?? null, remove: bookmarked },
            });
            await qc.invalidateQueries({ queryKey: ["collection"] });
            toast(bookmarked ? "Removed from want-to-go." : "Added to want-to-go.");
          } catch {
            toast("I couldn’t update that bookmark.");
          }
        }}
      >
        <Bookmark />
        {bookmarked ? "Bookmarked" : "Want to go"}
      </Button>
      <h2 className="mt-14 text-xl font-serif">Your visits · {entries.length}</h2>
      {entries.length ? (
        <ul className="museum-results">
          {entries.map((e) => (
            <li key={e.id}>
              <Link to="/collection/$entryId" params={{ entryId: e.id }}>
                <div>
                  <h3>{e.snapshot.artworks[0]?.title}</h3>
                  <p>{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <ArrowUpRight size={20} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-library-muted text-sm mt-5">we haven’t made a memory here yet.</p>
      )}
    </AppShell>
  );
}
