import { Button } from "@/components/ui/button";
import type { CollectionEntry } from "@/lib/collection-model";
import wordmark from "@/assets/curio-wordmark-2.png.asset.json";
export function MiniReceipt({ entry }: { entry: CollectionEntry }) {
  const p = entry.snapshot.artworks[0];
  return (
    <div className="mini-receipt">
      <img className="mini-wordmark" src={wordmark.url} alt="" />
      <p className="mini-museum">{entry.snapshot.museum}</p>
      <div className="mini-perforation" />
      <p className="mini-title">{p?.title || "A memory in progress"}</p>
      {p?.image_url ? (
        <img className="mini-art" src={p.image_url} alt={p.title} />
      ) : (
        <div className="mini-placeholder">✦</div>
      )}
      <p>{p?.artist}</p>
      <div className="mini-perforation" />
      <p>I WAS… {p?.emotions.join(" · ") || "—"}</p>
      <p>{p?.note}</p>
      <p className="mini-thanks">THANK YOU FOR VISITING</p>
    </div>
  );
}
export function ReceiptPocket({
  entries,
  label,
  onClick,
  large = false,
}: {
  entries: CollectionEntry[];
  label: string;
  onClick?: () => void;
  large?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`receipt-folder ${large ? "folder-large" : ""}`}
      aria-label={`Open ${label}, ${entries.length} ${entries.length === 1 ? "receipt" : "receipts"}`}
    >
      <div className="folder-stage">
        {entries
          .slice(0, 3)
          .reverse()
          .map((e, i) => (
            <div key={e.id} className={`folder-sheet sheet-${i}`}>
              <MiniReceipt entry={e} />
            </div>
          ))}
        <div className="acrylic-pocket">
          <i className="rivet rivet-tl" />
          <i className="rivet rivet-tr" />
          <i className="rivet rivet-bl" />
          <i className="rivet rivet-br" />
        </div>
      </div>
      <span className="folder-caption">
        {label}
        <span>
          {" "}
          · {entries.length} {entries.length === 1 ? "receipt" : "receipts"}
        </span>
      </span>
    </Button>
  );
}
