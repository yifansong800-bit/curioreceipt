import { formatLingerShort } from "@/lib/format";
import type { ReceiptArtwork } from "@/components/receipt";

export function ArtworkCard({
  artwork,
  onDelete,
  onEdit,
  identifyFailed,
}: {
  artwork: ReceiptArtwork;
  onDelete?: () => void;
  onEdit?: () => void;
  identifyFailed?: boolean;
}) {


  const palette = artwork.palette ?? [];
  const hasPalette = palette.length > 0;
  const gradient = hasPalette
    ? `linear-gradient(135deg, ${
        palette.length === 1
          ? `${palette[0]}, ${palette[0]}`
          : palette.join(", ")
      })`
    : undefined;

  return (
    <li
      className="relative overflow-hidden border"
      style={{ borderColor: "var(--border)" }}
    >
      {hasPalette ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: gradient,
              filter: "blur(28px)",
              transform: "scale(1.4)",
              opacity: 0.85,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundColor: "var(--paper)", opacity: 0.25 }}
          />
        </>
      ) : null}

      <div aria-hidden className="film-grain" />

      <div className="relative z-10 flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
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

        <div className="shrink-0 flex flex-col items-end gap-1">
          {onEdit ? (
            <button
              onClick={onEdit}
              className="text-xs underline px-1"
              style={{ color: "var(--ink-soft)" }}
            >
              edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              onClick={onDelete}
              className="text-xs underline px-1"
              style={{ color: "var(--ink-soft)" }}
            >
              remove
            </button>
          ) : null}
        </div>

      </div>
    </li>
  );
}
