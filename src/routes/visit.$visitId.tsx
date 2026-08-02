import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import exifr from "exifr";
import { toCanvas } from "html-to-image";
import { extractPalette } from "@/lib/palette";
import { downscaleImage } from "@/lib/downscale";


import { getSessionId } from "@/lib/session";
import { getVisit, updateVisitLocation } from "@/lib/visits.functions";
import { addArtwork, deleteArtwork, updateArtwork, uploadArtworkPhoto } from "@/lib/artworks.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, type ReceiptArtwork } from "@/components/receipt";
import { PrinterStage } from "@/components/printer-stage";
import { ModeMark } from "@/components/pixel-icons";
import { CameraCapture } from "@/components/camera-capture";
import { IdentifyResultCard, ScanThumb, ThinkingLines } from "@/components/identify-panel";

import { PieceProof } from "@/components/piece-proof";
import { PhotoCropper } from "@/components/photo-cropper";
import { StarRating } from "@/components/star-rating";
import { Footer } from "@/components/Footer";
import { slugify } from "@/lib/format";

type View = "compose" | "print";
type Stage = "idle" | "printing" | "printed";

const PRINTER_WARMUP_MS = 1000;

const MAX_ARTWORKS = 1;

export const Route = createFileRoute("/visit/$visitId")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "snap" ? ("snap" as const) : ("upload" as const),
  }),
  head: () => ({
    meta: [
      { title: "Your Curio receipt" },
      {
        name: "description",
        content: "Add artworks to your Curio museum visit receipt.",
      },
      { property: "og:title", content: "Your Curio receipt" },
      {
        property: "og:description",
        content: "Log your favorite piece and print it as a thermal receipt keepsake.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const { mode: captureMode } = Route.useSearch();
  const qc = useQueryClient();
  const getFn = useServerFn(getVisit);
  const addFn = useServerFn(addArtwork);
  const delFn = useServerFn(deleteArtwork);
  const updateFn = useServerFn(updateArtwork);
  const updateLocFn = useServerFn(updateVisitLocation);
  const uploadFn = useServerFn(uploadArtworkPhoto);

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

  // Remember the visitor's name so they don't have to re-enter it when
  // logging another museum in the same browser session.
  useEffect(() => {
    const name = visitQuery.data && "visitor_name" in visitQuery.data ? visitQuery.data.visitor_name : null;
    if (name) {
      try {
        localStorage.setItem("curio:visitor", name);
      } catch {}
    }
  }, [visitQuery.data]);

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
  const [ink, setInk] = useState<"bw" | "color">("bw");
  const [cropping, setCropping] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState<number | null>(null);



  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1);
  }, []);
  const printStageRef = useRef<HTMLDivElement | null>(null);

  // Height available for the printer + receipt so it fits without scrolling.
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const [printAreaH, setPrintAreaH] = useState(0);
  useEffect(() => {
    const el = printAreaRef.current;
    if (!el) return;
    const measure = () => setPrintAreaH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);


  const receiptRef = useRef<HTMLDivElement | null>(null);


  const atCap = artworks.length >= MAX_ARTWORKS;

  async function fileToBase64(file: Blob): Promise<string> {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // Shared add-artwork pipeline. Identification happens up-front inside
  // PieceForm before the row is created, so this path just uploads the
  // photo and inserts the artwork.
  async function addArtworkFromPayload(payload: {
    file: File | null;
    title: string;
    artist: string;
    year: string;
    medium: string;
    lingerSeconds: number;
    emotions: string[];
    rating: number;
    note: string;
  }) {
    const tempId = `temp-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

    let palette: string[] = [];
    if (payload.file) {
      try {
        palette = await extractPalette(payload.file, 3);
      } catch {
        /* palette optional */
      }
    }

    const optimistic: ReceiptArtwork = {
      id: tempId,
      position: 0,
      image_url: null,
      title: payload.title,
      artist: payload.artist,
      year: payload.year,
      medium: payload.medium,
      linger_seconds: payload.lingerSeconds,
      emotions: payload.emotions,
      palette,
      rating: payload.rating,
      note: payload.note,
    };
    qc.setQueryData(["visit", visitId, sessionId], (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const prev = old as { artworks?: ReceiptArtwork[] };
      const arts = prev.artworks ?? [];
      optimistic.position = arts.length + 1;
      return { ...prev, artworks: [...arts, optimistic] };
    });

    try {
      let imagePath: string | null = null;
      let photoTakenAt: string | null = null;
      if (payload.file) {
        try {
          const meta = await exifr.parse(payload.file, ["DateTimeOriginal"]);
          if (meta?.DateTimeOriginal) {
            photoTakenAt = new Date(meta.DateTimeOriginal).toISOString();
          }
        } catch {
          /* no exif; fine */
        }
        try {
          const downscaled = await downscaleImage(payload.file, 2000, 0.85);
          const dataBase64 = await fileToBase64(downscaled);
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
          imagePath = null;
        }
      }

      const row = await addFn({
        data: {
          sessionId,
          visitId,
          imagePath,
          title: payload.title,
          artist: payload.artist,
          year: payload.year,
          medium: payload.medium,
          lingerSeconds: payload.lingerSeconds,
          emotions: payload.emotions,
          photoTakenAt,
          palette,
          rating: payload.rating,
          note: payload.note,
        },
      });
      await qc.invalidateQueries({ queryKey: ["visit", visitId] });

    } catch (err) {
      console.error("[curio] add artwork failed", err);
      qc.setQueryData(["visit", visitId, sessionId], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const prev = old as { artworks?: ReceiptArtwork[] };
        return {
          ...prev,
          artworks: (prev.artworks ?? []).filter((a) => a.id !== tempId),
        };
      });
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Couldn't add artwork: ${msg}`);
    }
  }





  function goToPrint() {
    if (artworks.length === 0) return;
    const missing = artworks.filter((a) => a.linger_seconds < 0);
    if (missing.length > 0) {
      setConfirmMissing(missing.length);
      return;
    }
    proceedToPrint();
  }

  function proceedToPrint() {
    setConfirmMissing(null);
    setSaved(false);
    setStage("idle");
    setView("print");
  }

  function goToCompose() {
    setView("compose");
    setStage("idle");
  }

  function reprint() {
    setStage("idle");
    setSaved(false);
  }

  // Warm-up: show only the printer for a moment, then start feeding.
  // Also pre-dither all artwork images so they appear on the very first
  // frame of the feed animation — otherwise mobile could show empty image
  // slots until the async dither resolved mid-print.
  useEffect(() => {
    if (view !== "print" || stage !== "idle") return;
    let cancelled = false;
    const withImages = artworks.filter((a) => a.image_url);
    const cols = withImages.length === 1 ? 1 : 2;
    const cellW = cols === 1 ? 280 : 140;
    const bucketed = Math.max(32, Math.round(cellW / 8) * 8);
    const target = bucketed * 1.45;
    const warmup = Promise.all(
      withImages.map((a) =>
        import("@/lib/dither").then(({ ditherImage }) =>
          ditherImage(a.image_url!, target).catch(() => null),
        ),
      ),
    );
    const minDelay = new Promise<void>((r) => window.setTimeout(r, PRINTER_WARMUP_MS));
    // Cap the wait so a slow/broken image can't block the print forever.
    const maxDelay = new Promise<void>((r) => window.setTimeout(r, 4000));
    Promise.race([Promise.all([warmup, minDelay]), maxDelay]).then(() => {
      if (!cancelled) setStage("printing");
    });
    return () => {
      cancelled = true;
    };
  }, [view, stage, artworks]);

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
    const source = document.getElementById("curio-receipt") as HTMLElement | null;
    if (!source || !visit) return null;

    // The on-screen receipt sits inside a `transform: scale(...)` wrapper so
    // it fits under the printer. Snapshotting the live node forces us to
    // temporarily strip that transform, which visually cuts the receipt off
    // for a beat while html-to-image runs. Instead, clone the receipt into
    // an off-screen container at its natural 360px width and snapshot the
    // clone — the visible receipt is never mutated.
    const stage = document.createElement("div");
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "pointer-events: none",
      // Keep the clone in-flow enough that fonts/images resolve, but hide it
      // from the user by pushing it far off-screen.
      "transform: translate(-10000px, -10000px)",
      "transform-origin: top left",
      "z-index: -1",
      "background: transparent",
    ].join(";");
    const node = source.cloneNode(true) as HTMLElement;
    node.style.transform = "none";
    node.style.transformOrigin = "top left";
    node.style.width = "360px";
    stage.appendChild(node);
    document.body.appendChild(stage);

    let dataUrl: string;
    try {
      // Wait for fonts so text isn't captured in a fallback face.
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }

      // iOS Safari + html-to-image often drops <img> content inside the
      // <foreignObject> SVG render — the downloaded receipt comes back with
      // the image slots blank while text renders fine. To make the artwork
      // capture deterministic across every device, we:
      //   1. record each <img>'s position + src within the clone
      //   2. remove the <img>s from the clone before snapshotting layout
      //   3. composite the dithered images onto the resulting canvas manually
      //      via drawImage — this can't fail the way foreignObject does.
      const nodeRect = node.getBoundingClientRect();
      const imgs = Array.from(node.querySelectorAll("img"));
      const imgPlacements = imgs
        .map((img) => {
          const r = img.getBoundingClientRect();
          const src = img.getAttribute("src") || "";
          if (!src || r.width === 0 || r.height === 0) return null;
          return {
            src,
            x: r.left - nodeRect.left,
            y: r.top - nodeRect.top,
            w: r.width,
            h: r.height,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      // Swap each <img> for a same-sized placeholder so the layout stays
      // identical — removing them outright collapsed the receipt and made
      // the composited artwork overlap the text in the saved file.
      imgs.forEach((img) => {
        const r = img.getBoundingClientRect();
        const spacer = document.createElement("div");
        spacer.style.cssText = [
          `width:${r.width}px`,
          `height:${r.height}px`,
          `display:${window.getComputedStyle(img).display === "inline" ? "inline-block" : "block"}`,
          "background:transparent",
          "flex-shrink:0",
        ].join(";");
        img.parentElement?.replaceChild(spacer, img);
      });


      const naturalWidth = node.offsetWidth || 360;
      const naturalHeight = node.offsetHeight || node.scrollHeight;

      const pixelRatio = 2;
      const opts = {
        pixelRatio,
        cacheBust: true,
        // Transparent background — only the receipt paper (with its own
        // cream fill + scalloped edges) shows in the exported image.
        backgroundColor: undefined,
        width: naturalWidth,
        height: naturalHeight,
        canvasWidth: naturalWidth,
        canvasHeight: naturalHeight,
        style: { transform: "none", transformOrigin: "top left" },
      } as const;

      const canvas: HTMLCanvasElement = await toCanvas(node, opts);

      // Composite the artwork images onto the snapshot canvas.
      if (imgPlacements.length > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const loaded = await Promise.all(
            imgPlacements.map(
              (p) =>
                new Promise<{ p: typeof p; img: HTMLImageElement | null }>((resolve) => {
                  const im = new Image();
                  if (!p.src.startsWith("data:")) im.crossOrigin = "anonymous";
                  im.onload = () => resolve({ p, img: im });
                  im.onerror = () => resolve({ p, img: null });
                  im.src = p.src;
                }),
            ),
          );
          for (const { p, img } of loaded) {
            if (!img) continue;
            try {
              await img.decode();
            } catch {
              /* ignore */
            }
            ctx.drawImage(
              img,
              Math.round(p.x * pixelRatio),
              Math.round(p.y * pixelRatio),
              Math.round(p.w * pixelRatio),
              Math.round(p.h * pixelRatio),
            );
          }
        }
      }

      dataUrl = canvas.toDataURL("image/png");
    } finally {
      stage.remove();
    }

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const stamp = new Date().toISOString().slice(0, 10);
    return { blob, filename: `curio-${slugify(visit.museum)}-${stamp}.png` };
  }


  async function handleSaveToCameraRoll() {
    if (!visit) return;
    setSaving(true);
    try {
      const out = await renderReceiptBlob();
      if (!out) return;
      const file = new File([out.blob], out.filename, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      // Only hand off to the OS share sheet on touch devices (where "save to
      // photos" lives). On desktop we always download the file directly.
      const isTouch = window.matchMedia?.("(pointer: coarse)").matches === true;
      if (isTouch && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "My Curio receipt",
            text: `My visit to ${visit.museum} — logged on Curio ✦`,
          });
          setSaved(true);
          return;
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      // Desktop / unsupported devices: trigger a real download.
      const url = URL.createObjectURL(out.blob);
      const link = document.createElement("a");
      link.download = out.filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(true);

    } finally {
      setSaving(false);
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
  const printing = view === "print";

  return (
    <>
      <div
        className={
          printing
            ? "h-[100dvh] overflow-hidden transition-colors duration-500"
            : "min-h-screen transition-colors duration-500"
        }
        style={{
          backgroundColor: printing ? "var(--teal)" : "var(--paper)",
        }}
      >
        <div
          className={printing ? "mx-auto h-full" : "mx-auto"}
          style={{
            maxWidth: 640,
            paddingLeft: "max(2.5rem, env(safe-area-inset-left))",
            paddingRight: "max(2.5rem, env(safe-area-inset-right))",
            paddingTop: "max(1.5rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
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
              <ModeMark mode="log" size={22} className="mb-5" />
              <div className="flex items-center justify-between">
                <Link to="/" className="text-xs uppercase tracking-widest underline">
                  ← start over
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
                here with {visit.visitor_name}
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
                <PieceForm
                  captureMode={captureMode}
                  museum={visit.museum}
                  city={visit.city ?? null}
                  country={visit.country ?? null}
                  onSave={(payload) => addArtworkFromPayload(payload)}
                />
              ) : artworks[0] ? (
                <PieceProof
                  artwork={artworks[0]}
                  emotionPresets={EMOTION_PRESETS}
                  mediumPresets={MEDIUM_PRESETS}
                  noteMax={NOTE_MAX}
                  ink={ink}
                  onInkChange={setInk}
                  onAdjustPhoto={() => setCropping(true)}
                  onRemove={() => deleteMut.mutate(artworks[0].id)}
                  onSave={async (patch) => {
                    await updateFn({
                      data: {
                        sessionId,
                        visitId,
                        artworkId: artworks[0].id,
                        ...patch,
                      },
                    });
                    await qc.invalidateQueries({ queryKey: ["visit", visitId] });
                  }}
                />
              ) : null}

              <button
                type="button"
                onClick={goToPrint}
                disabled={artworks.length === 0}
                className="mt-10 w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: "var(--teal)",
                  color: "var(--yellow)",
                  fontWeight: 700,
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
              >
                {artworks.length === 0
                  ? "show me a piece first"
                  : "ready? let's print it →"}

              </button>
            </motion.div>
          ) : (
            <motion.div
              key="print"
              className="flex h-full flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: fadeDuration }}
            >

              <ModeMark mode="share" size={22} className="mb-5" color="#141414" />
              <div className="flex items-center justify-between">
                <button
                  onClick={goToCompose}
                  className="text-xs uppercase tracking-widest underline"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ← let me fix something
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
                      colorMode={ink}
                    />
                  </div>
                </PrinterStage>
              </div>

              <div className="mx-auto mt-6 space-y-3" style={{ maxWidth: 360 }}>
                {stage === "printed" ? (
                  <>
                    <button
                      onClick={saved ? () => {} : handleSaveToCameraRoll}
                      disabled={saving}
                      className="w-full uppercase tracking-widest text-sm py-3 disabled:opacity-40"
                      style={{
                        backgroundColor: "var(--yellow)",
                        color: "var(--teal)",
                        fontWeight: 700,
                        WebkitTapHighlightColor: "transparent",
                        touchAction: "manipulation",
                      }}
                    >
                      {saved
                        ? isMobile
                          ? "Saved to camera roll"
                          : "Downloaded receipt"
                        : saving
                          ? "Rendering..."
                          : isMobile
                            ? "Save to camera roll"
                            : "Download receipt"}
                    </button>
                    <Link
                      to="/begin"
                      className="block w-full text-center uppercase tracking-widest text-sm py-3"
                      style={{
                        backgroundColor: "var(--yellow)",
                        color: "var(--teal)",
                        fontWeight: 700,
                        WebkitTapHighlightColor: "transparent",
                        touchAction: "manipulation",
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
    {confirmMissing !== null ? (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          background: "rgba(0,0,0,0.4)",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
        onClick={() => setConfirmMissing(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm p-6"
          style={{ backgroundColor: "var(--paper)", color: "var(--ink)", border: "1px solid var(--ink)" }}
        >
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
            one thing
          </div>
          <p className="text-sm leading-relaxed">
            you didn't tell me how long you lingered. want me to print it anyway?
          </p>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmMissing(null)}
              className="flex-1 uppercase tracking-widest text-xs py-2 border"
              style={{ borderColor: "var(--ink)", color: "var(--ink)", backgroundColor: "transparent" }}
            >
              let me add it
            </button>
            <button
              type="button"
              onClick={proceedToPrint}
              className="flex-1 uppercase tracking-widest text-xs py-2 border"
              style={{ borderColor: "var(--ink)", backgroundColor: "var(--teal)", color: "var(--yellow)", fontWeight: 700 }}
            >
              print it
            </button>

          </div>
        </div>
      </div>
    ) : null}
    {cropping && artworks[0]?.image_url ? (
      <PhotoCropper
        src={artworks[0].image_url}
        busy={cropBusy}
        onCancel={() => setCropping(false)}
        onConfirm={async (blob) => {
          if (cropBusy) return;
          setCropBusy(true);
          try {
            const file = new File([blob], "crop.jpg", { type: "image/jpeg" });
            let palette: string[] = [];
            try {
              palette = await extractPalette(file, 3);
            } catch {
              /* optional */
            }
            const dataBase64 = await fileToBase64(blob);
            const { path } = await uploadFn({
              data: {
                sessionId,
                visitId,
                contentType: "image/jpeg",
                ext: "jpg",
                dataBase64,
              },
            });
            await updateFn({
              data: {
                sessionId,
                visitId,
                artworkId: artworks[0].id,
                imagePath: path,
                palette,
              },
            });
            await qc.invalidateQueries({ queryKey: ["visit", visitId] });
            setCropping(false);
          } catch (err) {
            console.error("[curio] crop failed", err);
            toast.error("Couldn't update the photo.");
          } finally {
            setCropBusy(false);
          }
        }}
      />
    ) : null}
    <Footer
      style={
        view === "print"
          ? { backgroundColor: "var(--teal)", color: "var(--yellow)" }
          : undefined
      }
    />
  </>
  );
}

// Sample a canvas to decide whether the receipt's image region actually
// rendered ink. Blank captures (an iOS Safari html-to-image failure mode)
// come back as almost pure cream paper across the whole surface; a real
// receipt has plenty of dark dither pixels. We scan a downsampled grid so
// this stays fast on mobile.
function canvasHasInk(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    // Focus on the lower ~65% of the receipt where artwork images live —
    // headers/text alone can produce enough dark pixels to false-pass.
    const startY = Math.floor(canvas.height * 0.35);
    const h = canvas.height - startY;
    const w = canvas.width;
    if (w === 0 || h === 0) return true;
    const data = ctx.getImageData(0, startY, w, h).data;
    let dark = 0;
    let sampled = 0;
    // Sample every ~16th pixel.
    for (let i = 0; i < data.length; i += 4 * 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 120) dark++;
      sampled++;
    }
    if (sampled === 0) return true;
    return dark / sampled > 0.01;
  } catch {
    // getImageData can throw on tainted canvases — assume OK so we don't loop.
    return true;
  }
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

type PiecePayload = {
  file: File | null;
  title: string;
  artist: string;
  year: string;
  medium: string;
  lingerSeconds: number;
  emotions: string[];
  rating: number;
  note: string;
};

function PieceForm({
  captureMode,
  museum,
  city,
  country,
  onSave,
}: {
  captureMode: "snap" | "upload";
  museum: string;
  city: string | null;
  country: string | null;
  onSave: (payload: PiecePayload) => Promise<void> | void;
}) {
  // Identification runs through the `identify-artwork` Supabase Edge Function
  // (Vision reverse-image → Gemini reasoning).

  // Nothing but the photo prompt shows first — details only appear once
  // Curio has something to look at.
  const [step, setStep] = useState<"capture" | "details" | "reflection">("capture");

  // Step 1: the piece
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [medium, setMedium] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [identifyFailed, setIdentifyFailed] = useState(false);
  // null = not asked yet (upload mode shows the offer card)
  const [identifyChoice, setIdentifyChoice] = useState<boolean | null>(null);
  const [suggestion, setSuggestion] = useState<{
    title: string;
    artist: string;
    year: string;
    medium: string;
    confident: boolean;
  } | null>(null);
  const identifyAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);


  // Step 2: the reflection
  const [lingerMin, setLingerMin] = useState<string>("");
  const [lingerSec, setLingerSec] = useState<string>("");
  const [emotions, setEmotions] = useState<string[]>([]);
  const [customEmotion, setCustomEmotion] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Clear the "couldn't identify" hint the moment the user edits any of
  // the identified fields — matches the spirit of the previous per-row hint.
  useEffect(() => {
    if (identifyFailed && (title.trim() || artist.trim() || year.trim() || medium.trim())) {
      setIdentifyFailed(false);
    }
  }, [title, artist, year, medium, identifyFailed]);

  async function runIdentify(target: File) {
    identifyAbortRef.current?.abort();
    const abort = new AbortController();
    identifyAbortRef.current = abort;
    setIdentifying(true);
    setIdentifyFailed(false);
    try {
      const downscaled = await downscaleImage(target, 1024, 0.85);
      if (abort.signal.aborted) return;
      const buf = await downscaled.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const imageBase64 = btoa(binary);
      if (abort.signal.aborted) return;
      const museumContext = [museum, city, country].filter(Boolean).join(", ");
      console.log("[curio] invoking identify-artwork edge function", { museumContext });
      const { data: result, error: invokeError } = await supabase.functions.invoke("identify-artwork", {
        body: {
          imageBase64,
          mimeType: "image/jpeg",
          museumContext,
          museum,
          city,
          country,
        },
      });
      if (abort.signal.aborted) return;
      if (invokeError) {
        console.error("[curio] identify-artwork invoke error", invokeError);
        toast("I couldn't get a look at that one", { description: "tell me about it instead?" });
        setIdentifyFailed(true);
        return;
      }
      console.log("[curio] identify-artwork result", result);
      const FALLBACK = "couldn't identify, enter manually";
      const clean = (v: unknown) => {
        if (typeof v !== "string") return "";
        const t = v.trim();
        if (!t || t === FALLBACK) return "";
        return t;
      };
      const rTitle = clean(result?.title);
      const rArtist = clean(result?.artist);
      const rYear = clean(result?.year);
      const rMedium = clean(result?.medium);
      const hasAnyField = Boolean(rTitle || rArtist || rYear || rMedium);
      if (!hasAnyField) {
        setIdentifyFailed(true);
        return;
      }
      // Surface as a suggestion the user can accept or dismiss.
      setSuggestion({
        title: rTitle,
        artist: rArtist,
        year: rYear,
        medium: rMedium,
        confident: Boolean(result?.confident),
      });
      setIdentifyFailed(false);
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error("[curio] identify failed", err);
        toast("I couldn't get a look at that one", { description: "tell me about it instead?" });
        setIdentifyFailed(true);
      }
    } finally {
      if (identifyAbortRef.current === abort) identifyAbortRef.current = null;
      setIdentifying(false);
    }

  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    const name = picked.name.toLowerCase();
    const isHeic =
      picked.type === "image/heic" ||
      picked.type === "image/heif" ||
      name.endsWith(".heic") ||
      name.endsWith(".heif");

    let ready: File;
    if (isHeic) {
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
        ready = new File([blob], jpgName, { type: "image/jpeg" });
      } catch (err) {
        console.error("HEIC conversion failed", err);
        alert("Couldn't read this photo — try a JPG or PNG.");
        setConverting(false);
        return;
      } finally {
        setConverting(false);
      }
    } else {
      ready = picked;
    }
    acceptFile(ready);
  }

  function acceptFile(ready: File) {
    setFile(ready);
    // Reset identified fields whenever a new photo replaces the old one.
    setTitle("");
    setArtist("");
    setYear("");
    setMedium("");
    setIdentifyFailed(false);
    setSuggestion(null);
    setStep("details");

    // Curio always asks before looking — unless already answered this session.
    let remembered: boolean | null = identifyChoice;
    if (remembered === null) {
      try {
        const stored = sessionStorage.getItem("curio:identify");
        if (stored === "yes") remembered = true;
        else if (stored === "no") remembered = false;
      } catch {}
    }
    if (remembered === true) {
      setIdentifyChoice(true);
      void runIdentify(ready);
    } else {
      setIdentifyChoice(remembered);
    }
  }

  function chooseIdentify(yes: boolean) {
    setIdentifyChoice(yes);
    try {
      sessionStorage.setItem("curio:identify", yes ? "yes" : "no");
    } catch {}
    if (yes && file) void runIdentify(file);
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    if (suggestion.title && !title.trim()) setTitle(suggestion.title);
    if (suggestion.artist && !artist.trim()) setArtist(suggestion.artist);
    if (suggestion.year && !year.trim()) setYear(suggestion.year);
    if (suggestion.medium && !medium.trim()) setMedium(suggestion.medium);
    setSuggestion(null);
  }


  function toggleEmotion(e: string) {
    setEmotions((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }
  function addCustom() {
    const v = customEmotion.trim().toLowerCase();
    if (!v) return;
    if (!emotions.includes(v)) setEmotions([...emotions, v]);
    setCustomEmotion("");
  }

  const canGoNext = !!file && title.trim().length > 0 && !identifying;

  function goNext() {
    if (!canGoNext) return;
    setStep("reflection");
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const minRaw = lingerMin.trim();
    const secRaw = lingerSec.trim();
    const lingerSeconds =
      minRaw === "" && secRaw === ""
        ? -1
        : Math.max(0, Math.floor(parseInt(minRaw || "0", 10))) * 60 +
          Math.max(0, Math.floor(parseInt(secRaw || "0", 10)));
    try {
      await onSave({
        file,
        title: title.trim(),
        artist: artist.trim(),
        year: year.trim(),
        medium: medium.trim(),
        lingerSeconds,
        emotions,
        rating,
        note: note.trim(),
      });
    } catch (err) {
      console.error("[curio] save piece failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Couldn't save piece: ${msg}`);
    } finally {
      // Give the button a beat of "saving…" even on fast optimistic paths.
      window.setTimeout(() => setSaving(false), 600);
    }
  }

  return (
    <div
      className="mt-8 border p-4 space-y-5"
      style={{ borderColor: "var(--border)" }}
      onKeyDown={(e) => {
        // Enter never submits — must click the explicit action buttons.
        const target = e.target as HTMLElement;
        if (
          e.key === "Enter" &&
          target.tagName !== "TEXTAREA" &&
          !(target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="text-xs uppercase tracking-widest flex items-center justify-between"
        style={{ color: "var(--ink-soft)" }}
      >
        <span>
          {step === "capture" ? "PHOTO" : step === "details" ? "DETAILS" : "REFLECTION"}
        </span>
        <span>
          {step === "capture" ? "● ○ ○" : step === "details" ? "○ ● ○" : "○ ○ ●"}
        </span>
      </div>

      {cameraOpen ? (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(f) => {
            setCameraOpen(false);
            acceptFile(f);
          }}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,image/heic,image/heif"
        className="hidden"
        onChange={handleFileChange}
      />

      {step === "capture" ? (
        <>
          <p className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
            show me the piece you couldn't walk past.
          </p>
          <button
            type="button"
            onClick={() =>
              captureMode === "snap" ? setCameraOpen(true) : fileInputRef.current?.click()
            }
            disabled={converting}
            className="w-full block border-2 border-dashed p-8 text-center disabled:opacity-60"
            style={{
              borderColor: "var(--border)",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            <div className="text-sm" style={{ color: "var(--ink)" }}>
              {converting
                ? "reading your photo…"
                : captureMode === "snap"
                  ? "✦ open the camera"
                  : "✦ choose a photo"}
            </div>
          </button>
          {captureMode === "snap" ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs underline"
                style={{ color: "var(--ink-soft)" }}
              >
                or pick one from your camera roll
              </button>
            </div>
          ) : null}
        </>
      ) : step === "details" ? (
        <>
          <div className="flex items-start gap-3">
            {preview ? <ScanThumb src={preview} scanning={identifying} /> : null}
            <div className="flex-1 min-w-0 text-sm" style={{ fontFamily: "var(--font-mono)" }}>
              {identifying ? (
                <ThinkingLines />
              ) : suggestion ? (
                <span>did I get it right?</span>
              ) : identifyFailed ? (
                <span>I don't know this one. tell me about it?</span>
              ) : identifyChoice === false ? (
                <span>all yours — what am I looking at?</span>
              ) : (
                <span>got it. want me to try to identify it?</span>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() =>
                    captureMode === "snap" ? setCameraOpen(true) : fileInputRef.current?.click()
                  }
                  className="text-xs uppercase tracking-widest underline"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {captureMode === "snap" ? "retake" : "change photo"}
                </button>
              </div>
            </div>
          </div>

          {!identifying && !suggestion && identifyChoice === null ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => chooseIdentify(true)}
                className="flex-1 text-xs uppercase tracking-widest py-3 border"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: "var(--teal)",
                  color: "var(--yellow)",
                  fontWeight: 700,
                  touchAction: "manipulation",
                }}
              >
                ✦ yes, take a look
              </button>
              <button
                type="button"
                onClick={() => chooseIdentify(false)}
                className="flex-1 text-xs uppercase tracking-widest py-3 border"
                style={{ borderColor: "var(--ink)", touchAction: "manipulation" }}
              >
                I'll type it myself
              </button>
            </div>
          ) : null}

          {suggestion ? (
            <IdentifyResultCard
              result={suggestion}
              onAccept={acceptSuggestion}
              onDismiss={() => setSuggestion(null)}
              onRetry={() => file && runIdentify(file)}
            />
          ) : null}

          {!identifying && !suggestion && identifyChoice !== null ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => file && runIdentify(file)}
                className="text-xs underline"
                style={{ color: "var(--ink-soft)" }}
              >
                ✦ {identifyFailed ? "take another look" : "let me identify it"}
              </button>
            </div>
          ) : null}

          <MiniField label="TITLE" value={title} onChange={setTitle} placeholder="Untitled" />
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <MiniField label="ARTIST" value={artist} onChange={setArtist} placeholder="Artist name" />
            <MiniField label="YEAR" value={year} onChange={setYear} placeholder="1889" />
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
                      backgroundColor: on ? "var(--teal)" : "transparent",
                      color: on ? "var(--yellow)" : "var(--ink)",
                    }}
                  >
                    [{m}]
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
            style={{
              borderColor: "var(--ink)",
              backgroundColor: "var(--teal)",
              color: "var(--yellow)",
              fontWeight: 700,
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            {identifying
              ? "one second…"
              : !title.trim()
                ? "give it a title first"
                : "next → how it landed"}
          </button>
        </>
      ) : (

        <>
          <div className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
            so — how did it land with you?
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
            <StarRating value={rating} onChange={setRating} />
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
                      backgroundColor: on ? "var(--teal)" : "transparent",
                      color: on ? "var(--yellow)" : "var(--ink)",
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
                      backgroundColor: "var(--teal)",
                      color: "var(--yellow)",
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

          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>
              QUICK NOTE{" "}
              <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic" }}>optional</span>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="what were you thinking, standing there?"
              maxLength={NOTE_MAX}
              className="w-full bg-transparent border-b py-1 text-sm outline-none"
              style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)" }}
            />
            <div className="text-[10px] mt-1 tabular-nums" style={{ color: "var(--ink-soft)" }}>
              {note.length}/{NOTE_MAX}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("details")}
              disabled={saving}
              className="uppercase tracking-widest text-sm py-3 px-4 border disabled:opacity-40"
              style={{ borderColor: "var(--ink)" }}
            >
              ← back
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
              style={{
                borderColor: "var(--ink)",
                backgroundColor: "var(--ink)",
                color: "var(--paper)",
                fontWeight: 700,
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              {saving ? "keeping it…" : "that's the one"}
            </button>
          </div>

        </>
      )}
    </div>
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


const NOTE_MAX = 48;

