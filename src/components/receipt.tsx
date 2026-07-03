import { useEffect, useState } from "react";
import { ditherImage } from "@/lib/dither";
import { formatLingerShort, formatReceiptDate, formatTotalTime } from "@/lib/format";

export type ReceiptArtwork = {
  id: string;
  position: number;
  image_url: string | null;
  title: string;
  artist: string;
  year: string;
  medium: string;
  linger_seconds: number;
  emotions: string[];
  palette?: string[] | null;
  rating?: number | null;
};

export type ReceiptProps = {
  visitorName: string;
  museum: string;
  city?: string | null;
  country?: string | null;
  sessionNumber: number;
  date: string | Date;
  artworks: ReceiptArtwork[];
};

const DASH_ROW = "- ".repeat(40).trim();
const STAR_ROW = "*".repeat(80);

const lineStyle = {
  whiteSpace: "nowrap" as const,
  overflow: "hidden" as const,
  textOverflow: "clip" as const,
};

export function Receipt({
  visitorName,
  museum,
  city,
  country,
  sessionNumber,
  date,
  artworks,
}: ReceiptProps) {
  const loggedArtworks = artworks.filter((a) => a.linger_seconds >= 0);
  const totalSeconds = loggedArtworks.reduce((sum, a) => sum + a.linger_seconds, 0);
  const totalTimeValue = loggedArtworks.length === 0 ? "-" : formatTotalTime(totalSeconds);
  const sess = String(sessionNumber).padStart(2, "0");
  const location = [city, country].filter(Boolean).join(", ").toUpperCase();

  return (
    <div
      id="curio-receipt"
      className="receipt-paper grain mx-auto text-[13px] leading-[1.35]"
      style={{
        width: 360,
        color: "var(--ink)",
        paddingTop: 44,
        paddingBottom: 48,
        paddingLeft: 24,
        paddingRight: 24,
        fontFamily: "var(--font-mono)",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        hyphens: "auto",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 54,
          lineHeight: 1,
          textAlign: "center",
          letterSpacing: 2,
          fontWeight: 700,
        }}
      >
        CURIO
      </div>
      <div style={{ textAlign: "center", marginTop: 14, letterSpacing: 1 }}>
        ****** www.curioreceipt.com ******
      </div>

      <div style={{ marginTop: 12 }}>
        <div>MUSEUM: {museum || "—"}</div>
        {location ? <div>LOCATION: {location}</div> : null}
        <div>DATE: {formatReceiptDate(date)}</div>
        <div>
          CURATOR: {(visitorName || "—").toUpperCase()} (SESH #{sess})
        </div>
      </div>

      <div style={{ marginTop: 8, ...lineStyle }}>{DASH_ROW}</div>
      <div style={{ marginTop: 6 }}>QTY DESCRIPTION</div>

      {artworks.length === 0 ? (
        <div style={{ marginTop: 10, opacity: 0.6 }}>
          &lt;add your first artwork&gt;
        </div>
      ) : (
        artworks.map((a) => <ArtworkBlock key={a.id} art={a} />)
      )}

      {artworks.some((a) => a.image_url) && (
        <ImageGrid artworks={artworks.filter((a) => a.image_url)} />
      )}

      <div style={{ marginTop: 12, ...lineStyle }}>{DASH_ROW}</div>
      <Row label="SUBTOTAL ITEM" value={String(artworks.length)} />
      <Row label="TOTAL TIME SPENT" value={totalTimeValue} />
      <div style={{ marginTop: 12, ...lineStyle }}>{STAR_ROW}</div>
      <div style={{ textAlign: "center", marginTop: 10, letterSpacing: 1 }}>
        THANK YOU FOR VISTING!
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0, flex: 1 }}>{value}</span>
    </div>
  );
}

function ArtworkBlock({ art }: { art: ReceiptArtwork }) {
  const pos = String(art.position).padStart(2, "0");
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700 }}>
        {pos}{" "}
        <span style={{ fontStyle: "italic" }}>{art.title || "Untitled"}</span>
        {art.year ? ` (${art.year})` : ""}
        {art.artist ? ` - ${art.artist}` : ""}
      </div>
      <Row
        label="* LINGER TIME"
        value={formatLingerShort(art.linger_seconds)}
      />
      <Row
        label="* MEDIUM"
        value={(art.medium || "—").toUpperCase()}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <span style={{ flexShrink: 0 }}>I WAS...</span>
        <span style={{ textAlign: "right", minWidth: 0, flex: 1 }}>
          {art.emotions.length === 0
            ? "—"
            : art.emotions.map((e) => `[${e}]`).join(" ")}
        </span>
      </div>
      <Row
        label="* RATING"
        value={renderStars(art.rating ?? 0)}
      />
    </div>
  );
}

function renderStars(n: number) {
  const filled = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function ImageGrid({ artworks }: { artworks: ReceiptArtwork[] }) {
  const cols = artworks.length === 1 ? 1 : 2;
  const cellW = cols === 1 ? 280 : 140;
  return (
    <div
      style={{
        marginTop: 14,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 10,
        justifyItems: "center",
      }}
    >
      {artworks.map((a) => (
        <div key={a.id} style={{ textAlign: "center" }}>
          <DitheredImage src={a.image_url!} size={cellW} />
          <div style={{ marginTop: 4 }}>{String(a.position).padStart(2, "0")}</div>
        </div>
      ))}
    </div>
  );
}

function DitheredImage({ src, size }: { src: string; size: number }) {
  const [out, setOut] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(1);

  // Quantize size to avoid re-dithering on tiny sub-pixel changes from
  // ResizeObserver / zoom scaling during the print animation — which
  // was causing brief flashes back to the original (non-dithered) image.
  const bucketed = Math.max(32, Math.round(size / 8) * 8);

  useEffect(() => {
    let cancelled = false;
    // Do NOT clear `out` here — keep the previous dithered frame on screen
    // while the new one computes so the receipt never flashes back to the
    // original color image mid-print.
    ditherImage(src, bucketed * 1.45)
      .then((result) => {
        if (!cancelled) {
          setOut(result.dataUrl);
          if (result.height > 0) {
            setAspectRatio(result.width / result.height);
          }
        }
      })
      .catch(() => {
        // Swallow: keep prior dithered frame (or nothing) rather than
        // falling back to the original color source.
      });
    return () => {
      cancelled = true;
    };
  }, [src, bucketed]);

  const displayHeight = Math.max(1, Math.round(size / aspectRatio));

  return (
    <div
      style={{
        width: size,
        height: displayHeight,
        overflow: "hidden",
        display: "block",
        background: "transparent",
      }}
    >
      {out ? (
        <img
          src={out}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      ) : null}
    </div>
  );
}
