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
import { Receipt, type ReceiptArtwork } from "@/components/receipt";
import { PrinterStage } from "@/components/printer-stage";
import { ArtworkCard } from "@/components/artwork-card";
import { Footer } from "@/components/Footer";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmMissing, setConfirmMissing] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

      // Ensure every <img> inside the clone (dithered artwork data URLs) is
      // fully decoded before snapshotting. On iOS Safari html-to-image
      // frequently produces a blank capture for images that haven't finished
      // decoding at snapshot time.
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          if (!(img.complete && img.naturalWidth > 0)) {
            await new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            });
          }
          try {
            await img.decode();
          } catch {
            /* ignore */
          }
        }),
      );

      const naturalWidth = node.offsetWidth || 360;
      const naturalHeight = node.offsetHeight || node.scrollHeight;

      const opts = {
        pixelRatio: 2,
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

      // iOS Safari + html-to-image: the first pass often drops <img>
      // content in the <foreignObject> render. We loop, sampling the
      // image-grid region of the canvas after each pass; if it's still
      // almost entirely paper-cream (i.e. artworks didn't render) we
      // retry. Cap at 5 attempts, then use whatever we've got.
      const MAX_ATTEMPTS = 5;
      let canvas: HTMLCanvasElement | null = null;
      const hasArtworkImages = imgs.length > 0;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        canvas = await toCanvas(node, opts);
        if (!hasArtworkImages) break;
        if (canvasHasInk(canvas)) break;
        await new Promise((r) => setTimeout(r, 120));
      }

      if (canvas) {
        dataUrl = canvas.toDataURL("image/png");
      } else {
        const { toPng } = await import("html-to-image");
        dataUrl = await toPng(node, opts);
      }
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
      if (nav.canShare?.({ files: [file] })) {
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
      // Fallback for desktop / unsupported devices: trigger a download
      const url = URL.createObjectURL(out.blob);
      const link = document.createElement("a");
      link.download = out.filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
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

  return (
    <>
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
                      const tempId = `temp-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

                      // Extract palette client-side up front so the entry
                      // row's color gradient shows immediately. It's fast
                      // (48x48 canvas sample) and avoids a "gray" flash
                      // before the background upload finishes.
                      let palette: string[] = [];
                      if (payload.file) {
                        try {
                          palette = await extractPalette(payload.file, 3);
                        } catch {
                          /* palette optional */
                        }
                      }

                      // Insert an optimistic row so the entry appears
                      // instantly. The real server row replaces it on the
                      // background invalidate below.
                      const optimistic: ReceiptArtwork = {
                        id: tempId,
                        position: 0, // filled in below
                        image_url: null,
                        title: payload.title,
                        artist: payload.artist,
                        year: payload.year,
                        medium: payload.medium,
                        linger_seconds: payload.lingerSeconds,
                        emotions: payload.emotions,
                        palette,
                        rating: payload.rating,
                      };
                      qc.setQueryData(
                        ["visit", visitId, sessionId],
                        (old: unknown) => {
                          if (!old || typeof old !== "object") return old;
                          const prev = old as { artworks?: ReceiptArtwork[] };
                          const arts = prev.artworks ?? [];
                          optimistic.position = arts.length + 1;
                          return { ...prev, artworks: [...arts, optimistic] };
                        },
                      );

                      // Kick off upload + insert in the background. Any
                      // failure rolls back the optimistic row and surfaces
                      // an alert without blocking the UI.
                      (async () => {
                        try {
                          let imagePath: string | null = null;
                          let photoTakenAt: string | null = null;
                          if (payload.file) {
                            try {
                              const meta = await exifr.parse(payload.file, [
                                "DateTimeOriginal",
                              ]);
                              if (meta?.DateTimeOriginal) {
                                photoTakenAt = new Date(
                                  meta.DateTimeOriginal,
                                ).toISOString();
                              }
                            } catch {
                              /* no exif; that's fine */
                            }
                            try {
                              const downscaled = await downscaleImage(
                                payload.file,
                                2000,
                                0.85,
                              );
                              const buf = await downscaled.arrayBuffer();
                              let binary = "";
                              const bytes = new Uint8Array(buf);
                              const chunk = 0x8000;
                              for (let i = 0; i < bytes.length; i += chunk) {
                                binary += String.fromCharCode(
                                  ...bytes.subarray(i, i + chunk),
                                );
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
                              console.error(
                                "[curio] photo upload failed",
                                uploadErr,
                              );
                              // Fall back to no image rather than failing
                              // the whole add.
                              imagePath = null;
                            }
                          }

                          await addFn({
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
                            },
                          });
                          await qc.invalidateQueries({
                            queryKey: ["visit", visitId],
                          });
                        } catch (err) {
                          console.error("[curio] add artwork failed", err);
                          // Rollback optimistic row.
                          qc.setQueryData(
                            ["visit", visitId, sessionId],
                            (old: unknown) => {
                              if (!old || typeof old !== "object") return old;
                              const prev = old as {
                                artworks?: ReceiptArtwork[];
                              };
                              return {
                                ...prev,
                                artworks: (prev.artworks ?? []).filter(
                                  (a) => a.id !== tempId,
                                ),
                              };
                            },
                          );
                          const msg =
                            err instanceof Error ? err.message : String(err);
                          alert(`Couldn't add artwork: ${msg}`);
                        }
                      })();
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
                type="button"
                onClick={goToPrint}
                disabled={artworks.length === 0}
                className="mt-10 w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                style={{
                  borderColor: "var(--ink)",
                  backgroundColor: "var(--ink)",
                  color: "var(--paper)",
                  fontWeight: 700,
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
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
                      onClick={saved ? () => {} : handleSaveToCameraRoll}
                      disabled={saving}
                      className="w-full uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
                      style={{
                        borderColor: "var(--ink)",
                        backgroundColor: "var(--ink)",
                        color: "var(--paper)",
                        fontWeight: 700,
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
            Missing linger time
          </div>
          <p className="text-sm leading-relaxed">
            You haven't logged linger time for {confirmMissing}{" "}
            {confirmMissing === 1 ? "artwork" : "artworks"}. Print receipt anyway?
          </p>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmMissing(null)}
              className="flex-1 uppercase tracking-widest text-xs py-2 border"
              style={{ borderColor: "var(--ink)", color: "var(--ink)", backgroundColor: "transparent" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={proceedToPrint}
              className="flex-1 uppercase tracking-widest text-xs py-2 border"
              style={{ borderColor: "var(--ink)", backgroundColor: "var(--ink)", color: "var(--paper)", fontWeight: 700 }}
            >
              Print anyway
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <Footer />
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



function AddArtworkForm({
  onSubmit,
  sessionId: _sessionId,
  visitId: _visitId,
}: {
  sessionId: string;
  visitId: string;
  onSubmit: (data: {
    file: File | null;
    title: string;
    artist: string;
    year: string;
    medium: string;
    lingerSeconds: number;
    emotions: string[];
    rating: number;
  }) => Promise<void> | void;
}) {
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
  const [savedCount, setSavedCount] = useState(0);
  const [uploadClosed, setUploadClosed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setUploadClosed(true);
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
      setUploadClosed(true);
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

    const lingerMinRaw = lingerMin.trim();
    const lingerSecRaw = lingerSec.trim();
    const lingerSeconds =
      lingerMinRaw === "" && lingerSecRaw === ""
        ? -1
        : Math.max(0, Math.floor(parseInt(lingerMinRaw || "0", 10))) * 60 +
          Math.max(0, Math.floor(parseInt(lingerSecRaw || "0", 10)));

    // Fire-and-forget: parent inserts an optimistic row immediately and
    // handles the photo upload + server insert in the background.
    try {
      onSubmit({
        file,
        title: title.trim(),
        artist: artist.trim(),
        year: year.trim(),
        medium: medium.trim(),
        lingerSeconds,
        emotions,
        rating,
      });
    } catch (err) {
      console.error("[curio] add artwork failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Couldn't add artwork: ${msg}`);
      setBusy(false);
      return;
    }

    // reset immediately so the form is ready for the next entry
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
    setUploadClosed(true);

    // Keep the "adding..." label visible briefly so the action feels
    // acknowledged even though the row appears optimistically.
    window.setTimeout(() => setBusy(false), 800);
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,image/heic,image/heif"
        className="hidden"
        onChange={handleFileChange}
      />

      {uploadClosed ? (
        <div
          className="flex items-center gap-3 border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          {file && preview ? (
            <img
              src={preview}
              alt=""
              className="w-12 h-12 object-cover"
            />
          ) : null}
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--ink-soft)" }}
          >
            {file && preview
              ? "✓ photo uploaded"
              : `✓ Artwork ${savedCount} saved`}
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="ml-auto text-xs uppercase tracking-widest underline"
          >
            {file && preview ? "change" : "add another photo"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full block border-2 border-dashed p-4 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          {converting ? (
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Converting photo…
            </span>
          ) : (
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              tap to upload photo
            </span>
          )}
        </button>
      )}


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

