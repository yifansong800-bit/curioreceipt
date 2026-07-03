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
};

export type ReceiptProps = {
  visitorName: string;
  museum: string;
  sessionNumber: number;
  date: string | Date;
  artworks: ReceiptArtwork[];
};

const DASH_ROW = "- - - - - - - - - - - - - - - -";
const STAR_ROW = "********************************";

export function Receipt({
  visitorName,
  museum,
  sessionNumber,
  date,
  artworks,
}: ReceiptProps) {
  const totalSeconds = artworks.reduce((sum, a) => sum + (a.linger_seconds || 0), 0);
  const sess = String(sessionNumber).padStart(2, "0");

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
        ******** www.curio.com ********
      </div>

      <div style={{ marginTop: 12 }}>
        <div>MUSEUM: {museum || "—"}</div>
        <div>DATE: {formatReceiptDate(date)}</div>
        <div>
          CURATOR: {(visitorName || "—").toUpperCase()} (SESH #{sess})
        </div>
      </div>

      <div style={{ marginTop: 8 }}>{DASH_ROW}</div>
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

      <div style={{ marginTop: 12 }}>{DASH_ROW}</div>
      <Row label="SUBTOTAL ITEM" value={String(artworks.length)} />
      <Row label="TOTAL TIME SPENT" value={formatTotalTime(totalSeconds)} />
      <div style={{ marginTop: 12 }}>{STAR_ROW}</div>
      <div style={{ textAlign: "center", marginTop: 10, letterSpacing: 1 }}>
        THANK YOU FOR VISTING!
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{label}</span>
      <span>{value}</span>
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
        value={formatLingerShort(art.linger_seconds || 0)}
      />
      <Row
        label="* MEDIUM"
        value={(art.medium || "—").toUpperCase()}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>I WAS...</span>
        <span style={{ textAlign: "right" }}>
          {art.emotions.length === 0
            ? "—"
            : art.emotions.map((e) => `[${e}]`).join(" ")}
        </span>
      </div>
    </div>
  );
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
          <DitheredImage src={a.image_url!} width={cellW} />
          <div style={{ marginTop: 4 }}>{String(a.position).padStart(2, "0")}</div>
        </div>
      ))}
    </div>
  );
}

function DitheredImage({ src, width }: { src: string; width: number }) {
  const [out, setOut] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setOut(null);
    ditherImage(src, width * 1.2)
      .then((data) => {
        if (!cancelled) setOut(data);
      })
      .catch(() => {
        if (!cancelled) setOut(src);
      });
    return () => {
      cancelled = true;
    };
  }, [src, width]);

  return (
    <img
      src={out ?? src}
      alt=""
      crossOrigin="anonymous"
      style={{
        width,
        height: "auto",
        display: "block",
        imageRendering: "pixelated",
      }}
    />
  );
}
