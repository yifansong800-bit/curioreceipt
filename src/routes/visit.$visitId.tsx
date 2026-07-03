import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Share2 } from "lucide-react";
import exifr from "exifr";
import { toJpeg } from "html-to-image";
import { extractPalette } from "@/lib/palette";
import { downscaleImage } from "@/lib/downscale";


import { getSessionId } from "@/lib/session";
import { getVisit, updateVisitLocation } from "@/lib/visits.functions";
import { addArtwork, deleteArtwork, updateArtwork, uploadArtworkPhoto } from "@/lib/artworks.functions";
import { Receipt, type ReceiptArtwork } from "@/components/receipt";
import { PrinterStage } from "@/components/printer-stage";
import { ArtworkCard } from "@/components/artwork-card";
import { slugify } from "@/lib/format";

type View = "compose" | "print";
type Stage = "idle" | "printing" | "printed";

const PRINTER_WARMUP_MS = 1000;

const MAX_ARTWORKS = 3;

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

const MEDIUM_PRESETS = [
  "oil on canvas",
  "acrylic",
  "watercolor",
  "photograph",
  "sculpture",
  "print",
  "mixed media",
  "digital",
  "video",
  "installation",
  "drawing",
  "textile",
];

function VisitPage() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getVisit);
  const addFn = useServerFn(addArtwork);
  const delFn = useServerFn(deleteArtwork);
  const updateFn = useServerFn(updateArtwork);
  const updateLocFn = useServerFn(updateVisitLocation);

  const reduce = useReducedMotion();

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

  const [view, setView] = useState<View>("compose");
  const [stage, setStage] = useState<Stage>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [sharing, setSharing] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1);
  }, []);
  const printStageRef = useRef<HTMLDivElement | null>(null);


  const receiptRef = useRef<HTMLDivElement | null>(null);

  const atCap = artworks.length >= MAX_ARTWORKS;
  const remaining = Math.max(0, MAX_ARTWORKS - artworks.length);

  function goToPrint() {
    if (artworks.length === 0) return;
    const missing = artworks.filter((a) => a.linger_seconds < 0);
    if (missing.length > 0) {
      const noun = missing.length === 1 ? "artwork" : "artworks";
      const proceed = window.confirm(
        `You haven't logged linger time for ${missing.length} ${noun}. Print receipt anyway?`
      );
      if (!proceed) return;
    }
    setStage("idle");
    setView("print");
  }

  function goToCompose() {
    setView("compose");
    setStage("idle");
  }

  function reprint() {
    setStage("idle");
  }

  // Warm-up: show only the printer for a moment, then start feeding.
  useEffect(() => {
    if (view !== "print" || stage !== "idle") return;
    const t = window.setTimeout(() => setStage("printing"), PRINTER_WARMUP_MS);
    return () => window.clearTimeout(t);
  }, [view, stage]);

  // Keep the printer itself in view during warm-up. Without this, the browser
  // can preserve the compose screen's scroll position and show only the
  // progress bar underneath the printer on long mobile visits.
  useEffect(() => {
    if (view !== "print" || stage !== "idle") return;
    const frame = window.requestAnimationFrame(() => {
      printStageRef.current?.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: reduce ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, stage, reduce]);

  // Escape returns to compose from the print view.
  useEffect(() => {
    if (view !== "print") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goToCompose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  async function renderReceiptBlob(): Promise<{ blob: Blob; filename: string } | null> {
    const node = document.getElementById("curio-receipt") as HTMLElement | null;
    if (!node || !visit) return null;

    // The receipt lives inside a `transform: scale(...)` wrapper on the print
    // view (so it fits under the printer). html-to-image samples the live
    // rendered size, which on mobile is shrunk by that transform and yields a
    // tiny/blank capture with broken text wrapping. Temporarily neutralize any
    // ancestor transforms so the receipt is measured at its natural 360px
    // layout, snapshot, then restore.
    const touched: { el: HTMLElement; transform: string; transformOrigin: string }[] = [];
    let anc: HTMLElement | null = node.parentElement;
    while (anc && anc !== document.body) {
      const cs = window.getComputedStyle(anc);
      if (cs.transform && cs.transform !== "none") {
        touched.push({
          el: anc,
          transform: anc.style.transform,
          transformOrigin: anc.style.transformOrigin,
        });
        anc.style.transform = "none";
        anc.style.transformOrigin = "top left";
      }
      anc = anc.parentElement;
    }

    let dataUrl: string;
    try {
      const naturalWidth = node.offsetWidth || 360;
      const naturalHeight = node.offsetHeight || node.scrollHeight;

      // Ensure every <img> inside the receipt (dithered artwork data URLs)
      // is fully decoded before snapshotting. On iOS Safari html-to-image
      // frequently produces a blank capture for images that haven't finished
      // decoding at snapshot time, which is why artworks came out empty.
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => {});
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }),
      );

      const opts = {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#f5ead5",
        quality: 0.95,
        width: naturalWidth,
        height: naturalHeight,
        canvasWidth: naturalWidth,
        canvasHeight: naturalHeight,
        style: { transform: "none", transformOrigin: "top left" },
      } as const;
      // iOS Safari: the first html-to-image pass often drops <img> content
      // when rendering through <foreignObject>. Running the snapshot a few
      // times in a row primes the cache and yields a fully-populated result.
      // See https://github.com/bubkoo/html-to-image/issues/361
      await toJpeg(node, opts);
      await toJpeg(node, opts);
      dataUrl = await toJpeg(node, opts);
    } finally {
      for (const t of touched) {
        t.el.style.transform = t.transform;
        t.el.style.transformOrigin = t.transformOrigin;
      }
    }


    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10);
    return { blob, filename: `curio-${slugify(visit.museum)}-${stamp}.jpg` };
  }

  async function handleSaveToCameraRoll() {
    if (!visit) return;
    setSaving(true);
    try {
      const out = await renderReceiptBlob();
      if (!out) return;
      const file = new File([out.blob], out.filename, { type: "image/jpeg" });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "My Curio receipt",
            text: `My visit to ${visit.museum} — logged on Curio ✦`,
          });
          return;
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      // Fallback for desktop / unsupported devices: trigger a download
      const url = URL.createObjectURL(out.blob);
      const link = document.createElement("a");
      link.download = out.filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  }


  async function handleShare() {
    if (!visit) return;
    setSharing(true);
    setShareHint(null);
    try {
      const out = await renderReceiptBlob();
      if (!out) return;
      const file = new File([out.blob], out.filename, { type: "image/jpeg" });
      const caption = `My visit to ${visit.museum} — logged on Curio ✦`;
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "My Curio receipt",
            text: caption,
          });
          return;
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      // Fallback: download + open Instagram
      const url = URL.createObjectURL(out.blob);
      const link = document.createElement("a");
      link.download = out.filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      try {
        await navigator.clipboard?.writeText(caption);
      } catch {}
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      setShareHint("Saved to your device — drop it into an Instagram Story or Post.");
    } finally {
      setSharing(false);
    }
  }


  if (visitQuery.isLoading || !sessionId) {
    return <Loading />;
  }

  if (!visit) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
          paddingRight: "max(1.5rem, env(safe-area-inset-right))",
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
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

  const fadeDuration = reduce ? 0 : 0.15;

  return (
    <div className="min-h-screen">
      <div
        className="mx-auto"
        style={{
          maxWidth: 640,
          paddingLeft: "max(2.5rem, env(safe-area-inset-left))",
          paddingRight: "max(2.5rem, env(safe-area-inset-right))",
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {view === "compose" ? (
            <motion.div
              key="compose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fadeDuration }}
            >
              <div className="flex items-center justify-between">
                <Link to="/" className="text-xs uppercase tracking-widest underline">
                  ← New visit
                </Link>
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: "var(--ink-soft)" }}
                >
                  SESH #{String(visit.session_number).padStart(2, "0")}
                </span>
              </div>

              <h1
                className="mt-6 break-words"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 8vw, 40px)",
                  lineHeight: 1.1,
                  letterSpacing: 2,
                }}
              >
                {visit.museum}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                Curated by {visit.visitor_name}
              </p>
              <LocationEditor
                city={visit.city ?? null}
                country={visit.country ?? null}
                onSave={async (city, country) => {
                  await updateLocFn({
                    data: { sessionId, visitId, city, country },
                  });
                  qc.invalidateQueries({ queryKey: ["visit", visitId] });
                }}
              />

              {!atCap ? (
                <>
                  <div
                    className="mt-8 text-xs uppercase tracking-widest"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    Add up to {MAX_ARTWORKS} artworks · {remaining} more{" "}
                    {remaining === 1 ? "spot" : "spots"} left
                  </div>
                  <AddArtworkForm
                    sessionId={sessionId}
                    visitId={visitId}
                    onSubmit={async (payload) => {
                      await addFn({
                        data: {
                          sessionId,
                          visitId,
                          ...payload,
                        },
                      });
                      await qc.invalidateQueries({ queryKey: ["visit", visitId] });
                    }}

                  />
                </>
              ) : (
                <div
                  className="mt-8 border px-4 py-3 text-xs uppercase tracking-widest text-center"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--ink-soft)",
                  }}
                >
                  {MAX_ARTWORKS} / {MAX_ARTWORKS} artworks added
                </div>
              )}

              {artworks.length > 0 ? (
                <div className="mt-10">
                  <h2
                    className="text-xs uppercase tracking-widest mb-3"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    Your entries
                  </h2>
                  <ul className="space-y-2">
                    {artworks.map((a) =>
                      editingId === a.id ? (
                        <li key={a.id}>
                          <EditArtworkForm
                            artwork={a}
                            onCancel={() => setEditingId(null)}
                            onSave={async (patch) => {
                              await updateFn({
                                data: { sessionId, visitId, artworkId: a.id, ...patch },
                              });
                              await qc.invalidateQueries({ queryKey: ["visit", visitId] });
                              setEditingId(null);
                            }}
                          />
                        </li>
                      ) : (
                        <ArtworkCard
                          key={a.id}
                          artwork={a}
                          onEdit={() => setEditingId(a.id)}
                          onDelete={() => deleteMut.mutate(a.id)}
                        />
                      ),
                    )}
                  </ul>

                </div>
              ) : null}

              <button
                onClick={goToPrint}
                disabled={artworks.length === 0}
                className="mt-10 w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: "var(--ink)",
                  color: "var(--paper)",
                  fontWeight: 700,
                }}
              >
                {artworks.length === 0
                  ? "Add an artwork first"
                  : "Ready to print? →"}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fadeDuration }}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={goToCompose}
                  className="text-xs uppercase tracking-widest underline"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ← Edit entries
                </button>
                {stage === "printed" ? (
                  <button
                    onClick={reprint}
                    className="text-xs uppercase tracking-widest underline"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    ↺ Print again
                  </button>
                ) : (
                  <span
                    className="text-xs uppercase tracking-widest"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    SESH #{String(visit.session_number).padStart(2, "0")}
                  </span>
                )}
              </div>

              <div ref={printStageRef} className="mt-8 scroll-mt-6">
                <PrinterStage
                  mode={stage}
                  warmupDuration={PRINTER_WARMUP_MS}
                  onPrintComplete={() =>
                    setStage((s) => (s === "printing" ? "printed" : s))
                  }
                >
                  <div ref={receiptRef}>
                    <Receipt
                      visitorName={visit.visitor_name}
                      museum={visit.museum}
                      city={visit.city ?? null}
                      country={visit.country ?? null}
                      sessionNumber={visit.session_number}
                      date={visit.created_at}
                      artworks={artworks}
                    />
                  </div>
                </PrinterStage>
              </div>

              <div className="mx-auto mt-6 space-y-3" style={{ maxWidth: 360 }}>
                {stage === "printed" ? (
                  <>
                    <button
                      onClick={handleSaveToCameraRoll}
                      disabled={saving || sharing}
                      className="w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                      style={{
                        borderColor: "var(--ink)",
                        backgroundColor: "var(--ink)",
                        color: "var(--paper)",
                        fontWeight: 700,
                      }}
                    >
                      {saving ? "Rendering..." : isMobile ? "Save to camera roll" : "Download receipt"}
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={sharing || saving}
                      className="w-full inline-flex items-center justify-center gap-2 uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                      style={{
                        borderColor: "var(--ink)",
                        backgroundColor: "var(--paper)",
                        color: "var(--ink)",
                        fontWeight: 700,
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                      {sharing ? "Preparing..." : "Share to Instagram"}
                    </button>

                    {shareHint ? (
                      <p
                        className="text-xs text-center"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {shareHint}
                      </p>
                    ) : null}
                    <Link
                      to="/"
                      className="block w-full text-center uppercase tracking-widest text-sm py-3 border"
                      style={{
                        borderColor: "var(--ink)",
                        backgroundColor: "var(--paper)",
                        color: "var(--ink)",
                        fontWeight: 700,
                      }}
                    >
                      Log another museum
                    </Link>
                  </>
                ) : null}
              </div>

            </motion.div>
          )}
        </AnimatePresence>
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
  sessionId,
  visitId,
}: {
  sessionId: string;
  visitId: string;
  onSubmit: (data: {
    imagePath: string | null;
    title: string;
    artist: string;
    year: string;
    medium: string;
    lingerSeconds: number;
    emotions: string[];
    photoTakenAt: string | null;
    palette: string[];
    rating: number;
  }) => Promise<void>;
}) {
  const uploadFn = useServerFn(uploadArtworkPhoto);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [medium, setMedium] = useState("");
  const [lingerMin, setLingerMin] = useState<string>("");
  const [lingerSec, setLingerSec] = useState<string>("");
  const [emotions, setEmotions] = useState<string[]>([]);
  const [customEmotion, setCustomEmotion] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!picked) return;

    const name = picked.name.toLowerCase();
    const isHeic =
      picked.type === "image/heic" ||
      picked.type === "image/heif" ||
      name.endsWith(".heic") ||
      name.endsWith(".heif");

    if (!isHeic) {
      setFile(picked);
      return;
    }

    setConverting(true);
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({
        blob: picked,
        toType: "image/jpeg",
        quality: 0.9,
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      const jpgName = picked.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
      setFile(new File([blob], jpgName, { type: "image/jpeg" }));
    } catch (err) {
      console.error("HEIC conversion failed", err);
      alert("Couldn't read this photo — try a JPG or PNG.");
    } finally {
      setConverting(false);
    }
  }


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
      let palette: string[] = [];
      if (file) {
        // Photo-processing steps are best-effort: if any of them fail
        // (exif, palette, arrayBuffer, base64), fall back to adding the
        // artwork without an image rather than aborting the whole submit.
        try {
          try {
            const meta = await exifr.parse(file, ["DateTimeOriginal"]);
            if (meta?.DateTimeOriginal) {
              photoTakenAt = new Date(meta.DateTimeOriginal).toISOString();
            }
          } catch {
            /* no exif; that's fine */
          }
          try {
            palette = await extractPalette(file, 3);
          } catch {
            /* palette optional */
          }
          const downscaled = await downscaleImage(file, 2000, 0.85);
          const buf = await downscaled.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const dataBase64 = btoa(binary);
          const { path } = await uploadFn({
            data: {
              sessionId,
              visitId,
              contentType: "image/jpeg",
              ext: "jpg",
              dataBase64,
            },
          });
          imagePath = path;
        } catch (uploadErr) {
          console.error("[curio] photo upload failed", uploadErr);
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          const proceed = window.confirm(
            `Couldn't upload the photo (${msg}). Add this artwork without an image?`,
          );
          if (!proceed) {
            setBusy(false);
            return;
          }
          imagePath = null;
          palette = [];
          photoTakenAt = null;
        }
      }

      const lingerMinRaw = lingerMin.trim();
      const lingerSecRaw = lingerSec.trim();
      const lingerSeconds =
        lingerMinRaw === "" && lingerSecRaw === ""
          ? -1
          : Math.max(0, Math.floor(parseInt(lingerMinRaw || "0", 10))) * 60 +
            Math.max(0, Math.floor(parseInt(lingerSecRaw || "0", 10)));

      await onSubmit({
        imagePath,
        title: title.trim(),
        artist: artist.trim(),
        year: year.trim(),
        medium: medium.trim(),
        lingerSeconds,
        emotions,
        photoTakenAt,
        palette,
        rating,
      });

      // reset
      setTitle("");
      setArtist("");
      setYear("");
      setMedium("");
      setLingerMin("");
      setLingerSec("");
      setEmotions([]);
      setCustomEmotion("");
      setRating(0);
      setFile(null);
      setSavedCount((n) => n + 1);
      setCollapsed(true);
    } catch (err) {
      console.error("[curio] add artwork failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Couldn't add artwork: ${msg}`);
    } finally {
      setBusy(false);
    }
  }


  if (collapsed) {
    return (
      <div
        className="mt-8 border px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--ink-soft)" }}
        >
          ✓ Artwork {savedCount} saved
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-xs uppercase tracking-widest underline"
        >
          + Add another
        </button>
      </div>
    );
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
          accept="image/*,.heic,.heif,image/heic,image/heif"
          className="hidden"
          onChange={handleFileChange}
        />
        {converting ? (
          <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Converting photo…
          </span>
        ) : preview ? (
          <div
            className="mx-auto relative overflow-hidden"
            style={{ width: "100%", maxWidth: 260, aspectRatio: "1 / 1" }}
          >
            <img
              src={preview}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
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
      <div>
        <MiniField label="MEDIUM" value={medium} onChange={setMedium} placeholder="oil on canvas" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {MEDIUM_PRESETS.map((m) => {
            const on = medium.trim().toLowerCase() === m;
            return (
              <button
                type="button"
                key={m}
                onClick={() => setMedium(on ? "" : m)}
                className="px-2 py-1 text-xs border"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--paper)" : "var(--ink)",
                }}
              >
                [{m}]
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div
          className="text-xs uppercase tracking-widest mb-1 flex items-baseline gap-2 flex-wrap"
          style={{ color: "var(--ink-soft)" }}
        >
          <span>LINGER TIME</span>
          <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic" }}>
            you can estimate this!
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            max={720}
            value={lingerMin}
            onChange={(e) => setLingerMin(e.target.value)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={lingerSec}
            onChange={(e) => setLingerSec(e.target.value)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>sec</span>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>
          RATING
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = rating >= n;
            return (
              <button
                type="button"
                key={n}
                onClick={() => setRating(rating === n ? 0 : n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="text-2xl leading-none px-1"
                style={{ color: on ? "var(--ink)" : "var(--ink-soft)", opacity: on ? 1 : 0.5 }}
              >
                {on ? "★" : "☆"}
              </button>
            );
          })}
          {rating > 0 ? (
            <button
              type="button"
              onClick={() => setRating(0)}
              className="ml-2 text-xs uppercase tracking-widest underline"
              style={{ color: "var(--ink-soft)" }}
            >
              clear
            </button>
          ) : null}
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

function LocationEditor({
  city,
  country,
  onSave,
}: {
  city: string | null;
  country: string | null;
  onSave: (city: string | null, country: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [cityDraft, setCityDraft] = useState(city ?? "");
  const [countryDraft, setCountryDraft] = useState(country ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCityDraft(city ?? "");
    setCountryDraft(country ?? "");
  }, [city, country]);

  const display = [city, country].filter(Boolean).join(", ");

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(cityDraft.trim() || null, countryDraft.trim() || null);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div
        className="mt-1 text-xs uppercase tracking-widest flex items-center gap-2 flex-wrap"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>{display || "Location unknown"}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="underline"
        >
          {display ? "edit" : "add location"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <input
        value={cityDraft}
        onChange={(e) => setCityDraft(e.target.value)}
        placeholder="City"
        maxLength={80}
        className="bg-transparent border-b py-1 outline-none text-sm"
        style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)", minWidth: 100 }}
      />
      <input
        value={countryDraft}
        onChange={(e) => setCountryDraft(e.target.value)}
        placeholder="Country"
        maxLength={80}
        className="bg-transparent border-b py-1 outline-none text-sm"
        style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)", minWidth: 100 }}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="text-xs uppercase tracking-widest underline disabled:opacity-40"
      >
        {busy ? "saving…" : "save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setCityDraft(city ?? "");
          setCountryDraft(country ?? "");
          setEditing(false);
        }}
        className="text-xs uppercase tracking-widest underline"
        style={{ color: "var(--ink-soft)" }}
      >
        cancel
      </button>
    </div>
  );
}

type EditPatch = {
  title: string;
  artist: string;
  year: string;
  medium: string;
  lingerSeconds: number;
  emotions: string[];
  rating: number;
};

function EditArtworkForm({
  artwork,
  onSave,
  onCancel,
}: {
  artwork: ReceiptArtwork;
  onSave: (patch: EditPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(artwork.title ?? "");
  const [artist, setArtist] = useState(artwork.artist ?? "");
  const [year, setYear] = useState(artwork.year ?? "");
  const [medium, setMedium] = useState(artwork.medium ?? "");
  const initialLinger = artwork.linger_seconds ?? -1;
  const [lingerMin, setLingerMin] = useState<string>(
    initialLinger < 0 ? "" : String(Math.floor(initialLinger / 60)),
  );
  const [lingerSec, setLingerSec] = useState<string>(
    initialLinger < 0 ? "" : String(initialLinger % 60),
  );
  const [emotions, setEmotions] = useState<string[]>(artwork.emotions ?? []);
  const [customEmotion, setCustomEmotion] = useState("");
  const [rating, setRating] = useState<number>(artwork.rating ?? 0);
  const [busy, setBusy] = useState(false);

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
      const minRaw = lingerMin.trim();
      const secRaw = lingerSec.trim();
      const lingerSeconds =
        minRaw === "" && secRaw === ""
          ? -1
          : Math.max(0, Math.floor(parseInt(minRaw || "0", 10))) * 60 +
            Math.max(0, Math.floor(parseInt(secRaw || "0", 10)));
      await onSave({
        title: title.trim(),
        artist: artist.trim(),
        year: year.trim(),
        medium: medium.trim(),
        lingerSeconds,
        emotions,
        rating,
      });
    } catch (err) {
      console.error("[curio] update artwork failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Couldn't save changes: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border p-4 space-y-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="text-xs uppercase tracking-widest flex items-center justify-between"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>Editing entry {String(artwork.position).padStart(2, "0")}</span>
      </div>

      <MiniField label="TITLE" value={title} onChange={setTitle} placeholder="SARS" />
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <MiniField label="ARTIST" value={artist} onChange={setArtist} placeholder="Fang Lijun" />
        <MiniField label="YEAR" value={year} onChange={setYear} placeholder="2003" />
      </div>
      <div>
        <MiniField label="MEDIUM" value={medium} onChange={setMedium} placeholder="oil on canvas" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {MEDIUM_PRESETS.map((m) => {
            const on = medium.trim().toLowerCase() === m;
            return (
              <button
                type="button"
                key={m}
                onClick={() => setMedium(on ? "" : m)}
                className="px-2 py-1 text-xs border"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--paper)" : "var(--ink)",
                }}
              >
                [{m}]
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div
          className="text-xs uppercase tracking-widest mb-1 flex items-baseline gap-2 flex-wrap"
          style={{ color: "var(--ink-soft)" }}
        >
          <span>LINGER TIME</span>
          <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic" }}>
            you can estimate this!
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            max={720}
            value={lingerMin}
            onChange={(e) => setLingerMin(e.target.value)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={lingerSec}
            onChange={(e) => setLingerSec(e.target.value)}
            className="w-16 bg-transparent border-b py-1 outline-none tabular-nums"
            style={{ borderColor: "var(--ink)" }}
          />
          <span>sec</span>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>
          RATING
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = rating >= n;
            return (
              <button
                type="button"
                key={n}
                onClick={() => setRating(rating === n ? 0 : n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="text-2xl leading-none px-1"
                style={{ color: on ? "var(--ink)" : "var(--ink-soft)", opacity: on ? 1 : 0.5 }}
              >
                {on ? "★" : "☆"}
              </button>
            );
          })}
          {rating > 0 ? (
            <button
              type="button"
              onClick={() => setRating(0)}
              className="ml-2 text-xs uppercase tracking-widest underline"
              style={{ color: "var(--ink-soft)" }}
            >
              clear
            </button>
          ) : null}
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 uppercase tracking-widest text-sm py-2 border disabled:opacity-40"
          style={{
            borderColor: "var(--ink)",
            backgroundColor: "var(--ink)",
            color: "var(--paper)",
            fontWeight: 700,
          }}
        >
          {busy ? "saving…" : "save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="uppercase tracking-widest text-sm py-2 px-4 border disabled:opacity-40"
          style={{ borderColor: "var(--ink)" }}
        >
          cancel
        </button>
      </div>
    </form>
  );
}

