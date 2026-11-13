import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, Download, Share2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toBlob } from "html-to-image";
import { Receipt } from "@/components/receipt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { collectionOptions } from "@/lib/collection-query";
import { categories } from "@/lib/collection-model";
import {
  deleteCollectionEntry,
  editCollectionPiece,
  resumeCollectionDraft,
} from "@/lib/collection.functions";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/collection/$entryId")({
  head: () =>
    pageHead("A memory, kept", "Open, edit, save or share your private Curio museum receipt."),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: Detail,
});
function Detail() {
  const { entryId } = Route.useParams();
  const { data } = useSuspenseQuery(collectionOptions());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useServerFn(deleteCollectionEntry);
  const edit = useServerFn(editCollectionPiece);
  const resume = useServerFn(resumeCollectionDraft);
  const entry = data.entries.find((e) => e.id === entryId);
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const piece = entry?.snapshot.artworks[0];
  const [fields, setFields] = useState({
    title: piece?.title ?? "",
    artist: piece?.artist ?? "",
    year: piece?.year ?? "",
    medium: piece?.medium ?? "",
    note: piece?.note ?? "",
    category: entry?.category ?? "Uncategorized",
  });
  async function exportImage(share: boolean) {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const images = [...ref.current.querySelectorAll("img")];
      await Promise.all(images.map((i) => i.decode()));
      const blob = await toBlob(ref.current, { pixelRatio: 2, cacheBust: false });
      if (!blob) throw new Error();
      const file = new File([blob], "curio-receipt.png", { type: "image/png" });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Curio receipt" });
        setDone("Shared receipt");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setDone("Downloaded receipt");
      }
    } catch {
      toast("I couldn’t export that receipt. Try again?");
    } finally {
      setBusy(false);
    }
  }
  if (!entry)
    return (
      <main className="account-page">
        <Link to="/library">← Library</Link>
        <p className="mt-12">This receipt is no longer here.</p>
      </main>
    );
  return (
    <main className="receipt-detail">
      <header className="detail-toolbar">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Library">
          <Link to="/library">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="text-xs uppercase tracking-widest">
          {entry.status === "saved" ? "A MEMORY, KEPT" : "DRAFT"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete visit"
          onClick={() => setDeleting(true)}
        >
          <Trash2 />
        </Button>
      </header>
      {piece ? (
        <div className="detail-receipt" ref={ref}>
          <Receipt
            visitorName={entry.snapshot.visitor_name}
            museum={entry.snapshot.museum}
            city={entry.snapshot.city}
            country={entry.snapshot.country}
            sessionNumber={entry.snapshot.session_number}
            date={entry.snapshot.created_at}
            artworks={entry.snapshot.artworks}
            colorMode={entry.ink}
          />
        </div>
      ) : (
        <p className="text-center my-20">we haven’t picked the piece yet.</p>
      )}
      <div className="detail-actions">
        {entry.status === "draft" && (
          <Button
            className="w-full bg-yellow text-ink"
            onClick={async () => {
              try {
                const r = await resume({ data: { id: entry.id } });
                localStorage.setItem("curio.session_id", r.sessionId);
                await navigate({
                  to: "/visit/$visitId",
                  params: { visitId: r.visitId },
                  search: { mode: "upload" },
                });
              } catch {
                toast("I couldn’t resume that draft.");
              }
            }}
          >
            Finish this visit →
          </Button>
        )}
        {piece && (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Edit details
            </Button>
            <Button disabled={busy} onClick={() => void exportImage(false)}>
              <Download />
              {busy ? "rendering…" : done === "Downloaded receipt" ? done : "Download"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void exportImage(true)}>
              <Share2 />
              {done === "Shared receipt" ? done : "Share"}
            </Button>
          </>
        )}
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogTitle>does this look right?</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await edit({
                  data: {
                    id: entry.id,
                    ...fields,
                    category: fields.category as (typeof categories)[number],
                  },
                });
                await qc.invalidateQueries({ queryKey: ["collection"] });
                setEditing(false);
                toast("Changes kept.");
              } catch (e) {
                toast(e instanceof Error ? e.message : "Couldn’t save.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {(["title", "artist", "year", "medium", "note"] as const).map((k) => (
              <label key={k} className="account-label">
                {k}
                <input
                  required={k === "title"}
                  maxLength={k === "note" ? 48 : k === "year" ? 20 : 120}
                  className="account-input"
                  value={fields[k]}
                  onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
                />
              </label>
            ))}
            <label className="account-label">
              Category
              <select
                className="account-input"
                value={fields.category}
                onChange={(e) => setFields({ ...fields, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy}>
              Keep changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogTitle>Let this memory go?</DialogTitle>
          <p className="text-sm">This deletes the visit and its photo. It can’t be undone.</p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await del({ data: { id: entry.id } });
                await qc.invalidateQueries({ queryKey: ["collection"] });
                await navigate({ to: "/library" });
              } catch {
                toast("I couldn’t delete it. Try again?");
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete visit
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
