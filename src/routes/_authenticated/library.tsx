import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Bookmark, FileClock, ArrowUpRight, Layers3 } from "lucide-react";
import { AppShell } from "@/components/collection/app-shell";
import { ReceiptPocket } from "@/components/collection/receipt-pocket";
import { Button } from "@/components/ui/button";
import { collectionOptions } from "@/lib/collection-query";
import { categories } from "@/lib/collection-model";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/library")({
  head: () =>
    pageHead(
      "My collection",
      "Your private archive of museum visits, feelings, and receipt keepsakes.",
    ),
  loader: async ({ context }) => {
    const data = await context.queryClient.ensureQueryData(collectionOptions());
    if (!data.profile?.onboarded) throw redirect({to:'/onboarding'});
    return data;
  },
  component: LibraryPage,
});
function LibraryPage() {
  const { data } = useSuspenseQuery(collectionOptions());
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState<"saved" | "draft">("saved");
  const entries = data.entries.filter((e) => e.status === (view === "saved" ? "saved" : "draft"));
  const groups = categories
    .map((category) => ({ category, entries: entries.filter((e) => e.category === category) }))
    .filter((g) => g.entries.length && (filter === "All" || filter === g.category));
  return (
    <AppShell>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end mt-7">
        <div className="min-w-0">
          <p className="collection-eyebrow">
            PRIVATE ARCHIVE / {String(entries.length).padStart(2, "0")} MEMORIES
          </p>
          <h1 className="collection-heading">
            My collection<span className="text-yellow">.</span>
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-library-fg"
          aria-label="Search museums"
          asChild
        >
          <Link to="/museums">
            <Search />
          </Link>
        </Button>
      </div>
      <div className="category-filters" aria-label="Collection categories">
        {["All", ...categories].map((c) => (
          <Button
            key={c}
            variant="ghost"
            className={`category-pill ${filter === c ? "pill-active" : ""}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="library-tools">
        <Button
          variant="ghost"
          onClick={() => setView(view === "saved" ? "draft" : "saved")}
          className={view === "draft" ? "text-yellow" : "text-library-muted"}
        >
          <FileClock />
          {view === "draft"
            ? "Show receipts"
            : `Drafts · ${data.entries.filter((e) => e.status === "draft").length}`}
        </Button>
        <Button asChild variant="ghost" className="text-library-muted">
          <Link to="/want-to-go">
            <Bookmark />
            Want to go
          </Link>
        </Button>
      </div>
      {!data.profile?.onboarded && (
        <Link to="/onboarding" className="profile-nudge">
          let’s put a name to this collection <ArrowUpRight size={16} />
        </Link>
      )}
      {groups.length ? (
        <div className="folder-grid">
          {groups.map((g) => (
            <ReceiptPocket
              key={g.category}
              entries={g.entries}
              label={g.category}
              onClick={() =>
                void navigate({ to: "/stack/$category", params: { category: g.category } })
              }
            />
          ))}
        </div>
      ) : (
        <section className="library-empty">
          <div className="empty-pocket">
            <Layers3 size={44} />
            <i className="rivet rivet-tl" />
            <i className="rivet rivet-tr" />
            <i className="rivet rivet-bl" />
            <i className="rivet rivet-br" />
          </div>
          <h2>
            {view === "draft"
              ? "Nothing left unfinished."
              : filter === "All"
                ? "A pocket for your next memory."
                : `Your ${filter.toLowerCase()} pocket is waiting.`}
          </h2>
          <p>
            {view === "draft"
              ? "your saved receipts are right here."
              : "show me the piece you couldn’t walk past."}
          </p>
          <Button asChild className="bg-yellow text-ink mt-5 h-12">
            <Link to="/begin" search={{ again: true }}>
              Log a visit <ArrowUpRight />
            </Link>
          </Button>
        </section>
      )}
      <p className="library-footnote">collected by you. kept for you.</p>
    </AppShell>
  );
}
