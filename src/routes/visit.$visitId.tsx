import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import exifr from "exifr";
import { toPng } from "html-to-image";

import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { getVisit } from "@/lib/visits.functions";
import { addArtwork, deleteArtwork } from "@/lib/artworks.functions";
import { Receipt, type ReceiptArtwork } from "@/components/receipt";
import { formatLingerShort, slugify } from "@/lib/format";

export const Route = createFileRoute("/visit/$visitId")({
  head: () => ({
    meta: [
      { title: "Your Curio receipt" },
      {
        name: "description",
        content: "Add artworks to your Curio museum visit receipt.",
      },
    ],
  }),
  component: VisitPage,
});

const EMOTION_PRESETS = [
  "moved",
  "in awe",
  "curious",
  "confused",
  "amused",
  "nostalgic",
  "unsettled",
  "touched",
  "inspired",
  "skeptical",
  "tender",
  "overwhelmed",
];

function VisitPage() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getVisit);
  const addFn = useServerFn(addArtwork);
  const delFn = useServerFn(deleteArtwork);

  const [sessionId, setSessionId] = useState<string>("");
  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const visitQuery = useQuery({
    enabled: !!sessionId,
    queryKey: ["visit", visitId, sessionId],
    queryFn: async () => getFn({ data: { visitId, sessionId } }),
  });

  const visit = visitQuery.data;
  const artworks: ReceiptArtwork[] = useMemo(
    () =>
      ((visit && "artworks" in visit ? visit.artworks : []) as ReceiptArtwork[]) ?? [],
    [visit],
  );

  const deleteMut = useMutation({
    mutationFn: async (artworkId: string) =>
      delFn({ data: { sessionId, visitId, artworkId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", visitId] }),
  });

  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    const node = document.getElementById("curio-receipt") as HTMLElement | null;
    if (!node || !visit) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "transparent",
      });
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `curio-${slugify(visit.museum)}-${stamp}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  if (visitQuery.isLoading || !sessionId) {
    return <Loading />;
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 48 }}>404</div>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
            This receipt doesn't belong to your session, or was never started.
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="mt-6 underline text-sm"
          >
            Start a new visit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left: form + list */}
        <div>
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xs uppercase tracking-widest underline">
              ← New visit
            </Link>
            <span className="text-xs uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
              SESH #{String(visit.session_number).padStart(2, "0")}
            </span>
          </div>

          <h1
            className="mt-6"
            style={{ fontFamily: "var(--font-display)", fontSize: 40, letterSpacing: 2 }}
          >
            {visit.museum}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Curated by {visit.visitor_name}
          </p>

          <AddArtworkForm
            onSubmit={async (payload) => {
              await addFn({
                data: {
                  sessionId,
                  visitId,
                  ...payload,
                },
              });
              qc.invalidateQueries({ queryKey: ["visit", visitId] });
            }}
          />

          {artworks.length > 0 ? (
            <div className="mt-10">
              <h2 className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
                Entries
              </h2>
              <ul className="space-y-2">
                {artworks.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 border px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
                      {String(a.position).padStart(2, "0")}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      <span className="italic">{a.title || "Untitled"}</span>
                      {a.artist ? ` — ${a.artist}` : ""}
                    </span>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {formatLingerShort(a.linger_seconds)}
                    </span>
                    <button
                      onClick={() => deleteMut.mutate(a.id)}
                      className="text-xs underline"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Right: live receipt + download */}
        <div className="lg:sticky lg:top-8 self-start">
          <div ref={receiptRef}>
            <Receipt
              visitorName={visit.visitor_name}
              museum={visit.museum}
              sessionNumber={visit.session_number}
              date={visit.created_at}
              artworks={artworks}
            />
          </div>
          <button
            onClick={handleDownload}
            disabled={artworks.length === 0 || downloading}
            className="mt-6 w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
            style={{
              borderColor: "var(--ink)",
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
              fontWeight: 700,
            }}
          >
            {downloading ? "Rendering..." : "Download receipt (PNG)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
        loading receipt…
      </div>
    </div>
  );
}

function AddArtworkForm({
  onSubmit,
}: {
  onSubmit: (data: {
    imagePath: string | null;
    title: string;
    artist: string;
    year: string;
    medium: string;
    lingerSeconds: number;
    emotions: string[];
    photoTakenAt: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [medium, setMedium] = useState("");
  const [lingerMin, setLingerMin] = useState<number>(0);
  const [lingerSec, setLingerSec] = useState<number>(0);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [customEmotion, setCustomEmotion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function toggleEmotion(e: string) {
    setEmotions((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  }

  function addCustom() {
    const v = customEmotion.trim().toLowerCase();
    if (!v) return;
    if (!emotions.includes(v)) setEmotions([...emotions, v]);
    setCustomEmotion("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      let imagePath: string | null = null;
      let photoTakenAt: string | null = null;
      if (file) {
        try {
          const meta = await exifr.parse(file, ["DateTimeOriginal"]);
          if (meta?.DateTimeOriginal) {
            photoTakenAt = new Date(meta.DateTimeOriginal).toISOString();
          }
        } catch {
          /* no exif; that's fine */
        }
        const ext = file.name.split(".").pop() || "jpg";
        const key = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("artwork-photos")
          .upload(key, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        imagePath = key;
      }

      const lingerSeconds =
        Math.max(0, Math.floor(lingerMin)) * 60 + Math.max(0, Math.floor(lingerSec));

      await onSubmit({
        imagePath,
        title: title.trim(),
        artist: artist.trim(),
        year: year.trim(),
        medium: medium.trim(),
        lingerSeconds,
        emotions,
        photoTakenAt,
      });

      // reset
      setTitle("");
      setArtist("");
      setYear("");
      setMedium("");
      setLingerMin(0);
      setLingerSec(0);
      setEmotions([]);
      setCustomEmotion("");
      setFile(null);
    } catch (err) {
      console.error(err);
      alert("Couldn't add artwork. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 border p-4 space-y-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="text-xs uppercase tracking-widest"
        style={{ color: "var(--ink-soft)" }}
      >
        + Add artwork
      </div>

      <label
        className="block border-2 border-dashed p-4 text-center cursor-pointer"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img
            src={preview}
            alt=""
            className="mx-auto max-h-40 object-contain"
          />
        ) : (
          <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
            tap to upload photo
          </span>
        )}
      </label>

      <MiniField label="TITLE" value={title} onChange={setTitle} placeholder="SARS" />
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <MiniField label="ARTIST" value={artist} onChange={setArtist} placeholder="Fang Lijun" />
        <MiniField label="YEAR" value={year} onChange={setYear} placeholder="2003" />
      </div>
      <MiniField label="MEDIUM" value={medium} onChange={setMedium} placeholder="oil on canvas" />

      <div>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
          LINGER TIME
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            max={720}
            value={lingerMin}
            onChange={(e) => setLingerMin(Number(e.target.value) || 0)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={lingerSec}
            onChange={(e) => setLingerSec(Number(e.target.value) || 0)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>sec</span>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>
          I WAS…
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EMOTION_PRESETS.map((e) => {
            const on = emotions.includes(e);
            return (
              <button
                type="button"
                key={e}
                onClick={() => toggleEmotion(e)}
                className="px-2 py-1 text-xs border"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--paper)" : "var(--ink)",
                }}
              >
                [{e}]
              </button>
            );
          })}
          {emotions
            .filter((e) => !EMOTION_PRESETS.includes(e))
            .map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => toggleEmotion(e)}
                className="px-2 py-1 text-xs border"
                style={{
                  borderColor: "var(--ink)",
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
            value={customEmotion}
            onChange={(e) => setCustomEmotion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="add your own"
            maxLength={30}
            className="flex-1 bg-transparent border-b py-1 text-sm outline-none"
            style={{ borderColor: "var(--ink)" }}
          />
          <button
            type="button"
            onClick={addCustom}
            className="text-xs uppercase tracking-widest underline"
          >
            add
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full uppercase tracking-widest text-sm py-2 border disabled:opacity-40"
        style={{
          borderColor: "var(--ink)",
          backgroundColor: "var(--ink)",
          color: "var(--paper)",
          fontWeight: 700,
        }}
      >
        {busy ? "adding..." : "add to receipt"}
      </button>
    </form>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b py-1 outline-none"
        style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)" }}
      />
    </label>
  );
}
