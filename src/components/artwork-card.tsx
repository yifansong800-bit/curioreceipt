import { formatLingerShort } from "@/lib/format";
import type { ReceiptArtwork } from "@/components/receipt";

export function ArtworkCard({
  artwork,
  onDelete,
}: {
  artwork: ReceiptArtwork;
  onDelete?: () => void;
}) {
  return (
    <li
      className="flex items-stretch gap-3 border p-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: 64,
          height: 64,
          background: "var(--border)",
        }}
      >
        {artwork.image_url ? (
          <img
            src={artwork.image_url}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "grayscale(1) contrast(1.2)",
            }}
          />
        ) : null}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-baseline gap-2">
          <span
            className="text-xs tabular-nums shrink-0"
            style={{ color: "var(--ink-soft)" }}
          >
            {String(artwork.position).padStart(2, "0")}
          </span>
          <span className="truncate text-sm">
            <span className="italic">{artwork.title || "Untitled"}</span>
            {artwork.artist ? ` — ${artwork.artist}` : ""}
          </span>
        </div>
        <div
          className="text-xs mt-1 flex items-center gap-2 truncate"
          style={{ color: "var(--ink-soft)" }}
        >
          <span>{formatLingerShort(artwork.linger_seconds)}</span>
          {artwork.medium ? <span>· {artwork.medium}</span> : null}
        </div>
      </div>

      {onDelete ? (
        <button
          onClick={onDelete}
          className="shrink-0 self-center text-xs underline px-1"
          style={{ color: "var(--ink-soft)" }}
        >
          remove
        </button>
      ) : null}
    </li>
  );
}
