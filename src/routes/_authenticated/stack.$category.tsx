import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptPocket } from "@/components/collection/receipt-pocket";
import { collectionOptions } from "@/lib/collection-query";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/stack/$category")({
  head: () =>
    pageHead(
      "Your receipt stack",
      "Browse the little memories tucked inside your Curio collection.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: StackPage,
});
function StackPage() {
  const { category } = Route.useParams();
  const { data } = useSuspenseQuery(collectionOptions());
  const entries = data.entries.filter((e) => e.category === category);
  const [index, setIndex] = useState(0);
  const entry = entries[index];
  return (
    <main className="stack-page">
      <div className="stack-surface">
        <Link to="/library" aria-label="Back to Library">
          <ArrowLeft size={22} />
        </Link>
        <header className="mt-8 flex justify-between gap-4 text-sm">
          <h1>{category}</h1>
          <span className="text-muted-foreground">
            @{data.profile?.username ?? "you"} · {index + 1}/{entries.length}
          </span>
        </header>
        {entry ? (
          <>
            <div className="stack-carousel">
              <div className="stack-neighbor left-neighbor">
                {entries[index - 1] && (
                  <ReceiptPocket entries={[entries[index - 1]]} label="Previous" large />
                )}
              </div>
              <ReceiptPocket entries={[entry]} label="" large />
              <div className="stack-neighbor right-neighbor">
                {entries[index + 1] && (
                  <ReceiptPocket entries={[entries[index + 1]]} label="Next" large />
                )}
              </div>
            </div>
            <div className="stack-info">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {entry.snapshot.museum}
              </p>
              <h2 className="text-xl mt-3">
                “{entry.snapshot.artworks[0]?.title || "A work in progress"}”
              </h2>
              <p className="mt-2 text-muted-foreground">{entry.snapshot.artworks[0]?.artist}</p>
              <div className="flex justify-center items-center gap-4 mt-7">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous receipt"
                  disabled={!index}
                  onClick={() => setIndex(index - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button asChild variant="outline" className="h-12">
                  <Link to="/collection/$entryId" params={{ entryId: entry.id }}>
                    Open receipt <ArrowRight />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next receipt"
                  disabled={index >= entries.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-24 text-center">This pocket is empty.</p>
        )}
      </div>
    </main>
  );
}
