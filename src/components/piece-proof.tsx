import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ReceiptArtwork } from "@/components/receipt";
import { StarRating } from "@/components/star-rating";
import { formatLingerShort } from "@/lib/format";
import { ditherImage } from "@/lib/dither";

export type InkMode = "bw" | "color";

export type ProofPatch = {
  title?: string;
  artist?: string;
  year?: string;
  medium?: string;
  lingerSeconds?: number;
  emotions?: string[];
  rating?: number;
  note?: string;
};

type FieldKey =
  | "identity"
  | "medium"
  | "linger"
  | "emotions"
  | "rating"
  | "note"
  | null;

const DASH = "- ".repeat(30).trim();

export function PieceProof({
  artwork,
  emotionPresets,
  mediumPresets,
  noteMax,
  ink,
  onInkChange,
  onSave,
  onRemove,
  onAdjustPhoto,
}: {
  artwork: ReceiptArtwork;
  emotionPresets: string[];
  mediumPresets: string[];
  noteMax: number;
  ink: InkMode;
  onInkChange: (v: InkMode) => void;
  onSave: (patch: ProofPatch) => Promise<void>;
  onRemove: () => void;
  onAdjustPhoto: () => void;
}) {
  const [open, setOpen] = useState<FieldKey>(null);
  const [busy, setBusy] = useState(false);

  async function commit(patch: ProofPatch) {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(patch);
      setOpen(null);
    } finally {
      setBusy(false);
    }
  }

  const titleLine = [
    artwork.title || "Untitled",
    artwork.year ? `(${artwork.year})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
          DOES THIS LOOK RIGHT?
        </h2>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
          tap a line to edit
        </span>
      </div>

      <div
        className="receipt-paper grain relative"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
          fontSize: 13,
          lineHeight: 1.4,
          padding: "28px 18px 30px",
        }}
      >
        <div style={{ textAlign: "center", letterSpacing: 1, fontSize: 11 }}>
          ****** RECEIPT DRAFT ******
        </div>

        <div
          style={{ marginTop: 10, whiteSpace: "nowrap", overflow: "hidden" }}
          aria-hidden
        >
          {DASH}
        </div>

        {/* Title / artist */}
        <ProofRow
          open={open === "identity"}
          onOpen={() => setOpen(open === "identity" ? null : "identity")}
          display={
            <div style={{ fontWeight: 700 }}>
              {String(artwork.position).padStart(2, "0")}{" "}
              <span style={{ fontStyle: "italic" }}>{titleLine}</span>
              {artwork.artist ? ` — ${artwork.artist}` : ""}
            </div>
          }
          editor={
            <IdentityEditor
              artwork={artwork}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(p) => commit(p)}
            />
          }
        />

        <ProofRow
          label="* MEDIUM"
          open={open === "medium"}
          onOpen={() => setOpen(open === "medium" ? null : "medium")}
          display={artwork.medium ? artwork.medium.toUpperCase() : null}
          editor={
            <MediumEditor
              value={artwork.medium ?? ""}
              presets={mediumPresets}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(medium) => commit({ medium })}
            />
          }
        />

        <ProofRow
          label="* LINGER TIME"
          open={open === "linger"}
          onOpen={() => setOpen(open === "linger" ? null : "linger")}
          display={
            artwork.linger_seconds >= 0 ? formatLingerShort(artwork.linger_seconds) : null
          }
          editor={
            <LingerEditor
              seconds={artwork.linger_seconds}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(lingerSeconds) => commit({ lingerSeconds })}
            />
          }
        />

        <div
          style={{ marginTop: 10, whiteSpace: "nowrap", overflow: "hidden" }}
          aria-hidden
        >
          {DASH}
        </div>

        <ProofRow
          label="I WAS..."
          open={open === "emotions"}
          onOpen={() => setOpen(open === "emotions" ? null : "emotions")}
          display={
            artwork.emotions?.length
              ? artwork.emotions.map((e) => `[${e}]`).join(" ")
              : null
          }
          editor={
            <EmotionEditor
              value={artwork.emotions ?? []}
              presets={emotionPresets}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(emotions) => commit({ emotions })}
            />
          }
        />

        <ProofRow
          label="RATING"
          open={open === "rating"}
          onOpen={() => setOpen(open === "rating" ? null : "rating")}
          display={artwork.rating ? <Stars value={artwork.rating} /> : null}
          editor={
            <RatingEditor
              value={artwork.rating ?? 0}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(rating) => commit({ rating })}
            />
          }
        />

        <ProofRow
          label="NOTE"
          open={open === "note"}
          onOpen={() => setOpen(open === "note" ? null : "note")}
          display={artwork.note ? `“${artwork.note}”` : null}
          editor={
            <NoteEditor
              value={artwork.note ?? ""}
              max={noteMax}
              busy={busy}
              onCancel={() => setOpen(null)}
              onSave={(note) => commit({ note })}
            />
          }
        />

        <div
          style={{ marginTop: 12, whiteSpace: "nowrap", overflow: "hidden" }}
          aria-hidden
        >
          {DASH}
        </div>

        {/* Photo + ink */}
        <div className="mt-3 flex items-center gap-3">
          <PhotoThumb src={artwork.image_url} ink={ink} />
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={onAdjustPhoto}
              disabled={!artwork.image_url}
              className="text-xs uppercase tracking-widest underline disabled:opacity-40"
              style={{ touchAction: "manipulation" }}
            >
              Crop / adjust →
            </button>
            <div className="text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>
              this crop prints on the receipt
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
            Ink
          </span>
          <div className="flex" style={{ border: "1px solid var(--ink)" }}>
            {(
              [
                ["bw", "B&W"],
                ["color", "Color"],
              ] as const
            ).map(([mode, label]) => {
              const on = ink === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onInkChange(mode)}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest"
                  style={{
                    backgroundColor: on ? "var(--ink)" : "transparent",
                    color: on ? "var(--paper)" : "var(--ink)",
                    touchAction: "manipulation",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-[10px] uppercase tracking-widest underline"
          style={{ color: "var(--ink-soft)" }}
        >
          remove piece
        </button>
      </div>
    </div>
  );
}

function ProofRow({
  label,
  display,
  editor,
  open,
  onOpen,
}: {
  label?: string;
  display: React.ReactNode;
  editor: React.ReactNode;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-2 py-2"
              style={{ border: "1px dashed var(--ink)", backgroundColor: "transparent" }}
            >
              {label ? (
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>
                  {label}
                </div>
              ) : null}
              {editor}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="view"
            type="button"
            onClick={onOpen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full text-left"
            style={{ touchAction: "manipulation" }}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              {label ? <span style={{ flexShrink: 0 }}>{label}</span> : null}
              <span
                style={{
                  textAlign: label ? "right" : "left",
                  minWidth: 0,
                  flex: 1,
                  opacity: display ? 1 : 0.45,
                  fontStyle: display ? undefined : "italic",
                }}
              >
                {display ?? "— add"}
              </span>
              <span aria-hidden style={{ flexShrink: 0, opacity: 0.5 }}>
                ✎
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditorActions({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex gap-3 mt-3">
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="text-[10px] uppercase tracking-widest underline disabled:opacity-40"
        style={{ fontWeight: 700, touchAction: "manipulation" }}
      >
        {busy ? "saving…" : "save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-[10px] uppercase tracking-widest underline disabled:opacity-40"
        style={{ color: "var(--ink-soft)", touchAction: "manipulation" }}
      >
        cancel
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  borderColor: "var(--ink)",
  fontFamily: "var(--font-mono)",
};

function IdentityEditor({
  artwork,
  busy,
  onCancel,
  onSave,
}: {
  artwork: ReceiptArtwork;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: ProofPatch) => void;
}) {
  const [title, setTitle] = useState(artwork.title ?? "");
  const [artist, setArtist] = useState(artwork.artist ?? "");
  const [year, setYear] = useState(artwork.year ?? "");

  return (
    <div className="space-y-2">
      <Labeled label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="w-full bg-transparent border-b py-1 text-sm outline-none"
          style={inputStyle}
        />
      </Labeled>
      <div className="grid grid-cols-[1fr_90px] gap-3">
        <Labeled label="Artist">
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            maxLength={120}
            className="w-full bg-transparent border-b py-1 text-sm outline-none"
            style={inputStyle}
          />
        </Labeled>
        <Labeled label="Year">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            maxLength={20}
            className="w-full bg-transparent border-b py-1 text-sm outline-none"
            style={inputStyle}
          />
        </Labeled>
      </div>
      <EditorActions
        busy={busy}
        onCancel={onCancel}
        onSave={() =>
          onSave({ title: title.trim(), artist: artist.trim(), year: year.trim() })
        }
      />
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function MediumEditor({
  value,
  presets,
  busy,
  onCancel,
  onSave,
}: {
  value: string;
  presets: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [medium, setMedium] = useState(value);
  return (
    <div>
      <input
        value={medium}
        onChange={(e) => setMedium(e.target.value)}
        maxLength={80}
        placeholder="oil on canvas"
        className="w-full bg-transparent border-b py-1 text-sm outline-none"
        style={inputStyle}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {presets.map((m) => {
          const on = medium.trim().toLowerCase() === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMedium(on ? "" : m)}
              className="px-2 py-1 text-[10px]"
              style={{
                border: "1px solid var(--ink)",
                backgroundColor: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper)" : "var(--ink)",
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
      <EditorActions busy={busy} onCancel={onCancel} onSave={() => onSave(medium.trim())} />
    </div>
  );
}

function LingerEditor({
  seconds,
  busy,
  onCancel,
  onSave,
}: {
  seconds: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: number) => void;
}) {
  const [min, setMin] = useState(seconds >= 0 ? String(Math.floor(seconds / 60)) : "");
  const [sec, setSec] = useState(seconds >= 0 ? String(seconds % 60) : "");
  return (
    <div>
      <div className="flex items-end gap-2">
        <input
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="0"
          maxLength={3}
          className="bg-transparent border-b py-1 text-sm outline-none w-14 text-center"
          style={inputStyle}
        />
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          min
        </span>
        <input
          value={sec}
          onChange={(e) => setSec(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="00"
          maxLength={2}
          className="bg-transparent border-b py-1 text-sm outline-none w-14 text-center"
          style={inputStyle}
        />
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          sec
        </span>
      </div>
      <EditorActions
        busy={busy}
        onCancel={onCancel}
        onSave={() => {
          const m = min.trim();
          const s = sec.trim();
          const total =
            m === "" && s === ""
              ? -1
              : Math.max(0, parseInt(m || "0", 10)) * 60 + Math.max(0, parseInt(s || "0", 10));
          onSave(total);
        }}
      />
    </div>
  );
}

function EmotionEditor({
  value,
  presets,
  busy,
  onCancel,
  onSave,
}: {
  value: string[];
  presets: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (v: string[]) => void;
}) {
  const [emotions, setEmotions] = useState<string[]>(value);
  const [custom, setCustom] = useState("");

  function toggle(e: string) {
    setEmotions((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }
  function addCustom() {
    const v = custom.trim().toLowerCase();
    if (!v) return;
    if (!emotions.includes(v)) setEmotions([...emotions, v]);
    setCustom("");
  }

  const extras = emotions.filter((e) => !presets.includes(e));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((e) => {
          const on = emotions.includes(e);
          return (
            <button
              key={e}
              type="button"
              onClick={() => toggle(e)}
              className="px-2 py-1 text-[10px]"
              style={{
                border: "1px solid var(--ink)",
                backgroundColor: on ? "var(--ink)" : "transparent",
                color: on ? "var(--paper)" : "var(--ink)",
              }}
            >
              [{e}]
            </button>
          );
        })}
        {extras.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => toggle(e)}
            className="px-2 py-1 text-[10px]"
            style={{
              border: "1px solid var(--ink)",
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            [{e}] ×
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="add your own"
          maxLength={30}
          className="flex-1 bg-transparent border-b py-1 text-sm outline-none"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={addCustom}
          className="text-[10px] uppercase tracking-widest underline"
        >
          add
        </button>
      </div>
      <EditorActions busy={busy} onCancel={onCancel} onSave={() => onSave(emotions)} />
    </div>
  );
}

function RatingEditor({
  value,
  busy,
  onCancel,
  onSave,
}: {
  value: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: number) => void;
}) {
  const [rating, setRating] = useState(value);
  return (
    <div>
      <StarRating value={rating} onChange={setRating} size="text-xl" />
      <EditorActions busy={busy} onCancel={onCancel} onSave={() => onSave(rating)} />
    </div>
  );
}

function NoteEditor({
  value,
  max,
  busy,
  onCancel,
  onSave,
}: {
  value: string;
  max: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [note, setNote] = useState(value);
  return (
    <div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="one line on how it felt"
        maxLength={max}
        className="w-full bg-transparent border-b py-1 text-sm outline-none"
        style={inputStyle}
      />
      <div className="text-[10px] mt-1 tabular-nums" style={{ color: "var(--ink-soft)" }}>
        {note.length}/{max}
      </div>
      <EditorActions busy={busy} onCancel={onCancel} onSave={() => onSave(note.trim())} />
    </div>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span>
      {"★".repeat(full)}
      {half ? "⯪" : ""}
      {"☆".repeat(Math.max(0, empty))}
    </span>
  );
}

function PhotoThumb({ src, ink }: { src: string | null; ink: InkMode }) {
  const [dithered, setDithered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!src || ink !== "bw") {
      setDithered(null);
      return;
    }
    ditherImage(src, 160)
      .then((r) => {
        if (!cancelled) setDithered(r.dataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, ink]);

  if (!src) {
    return (
      <div
        className="shrink-0 flex items-center justify-center text-[10px] uppercase tracking-widest"
        style={{ width: 72, height: 72, border: "1px dashed var(--ink)", color: "var(--ink-soft)" }}
      >
        no photo
      </div>
    );
  }

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{ width: 72, height: 72, border: "1px solid var(--ink)" }}
    >
      <img
        src={ink === "bw" ? (dithered ?? src) : src}
        alt="Your piece"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
