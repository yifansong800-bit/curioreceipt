import { useCallback, useEffect, useRef, useState } from "react";
import { ditherImage } from "@/lib/dither";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN = 0.08;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/**
 * Full-screen free-form crop sheet, styled to match the receipt/thermal
 * aesthetic. Returns a JPEG blob of the cropped region.
 */
export function PhotoCropper({
  src,
  busy,
  onCancel,
  onConfirm,
}: {
  src: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}) {
  const [workingSrc, setWorkingSrc] = useState(src);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [preview, setPreview] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    rect: Rect;
    boxW: number;
    boxH: number;
  } | null>(null);

  useEffect(() => {
    setWorkingSrc(src);
  }, [src]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    loadImage(workingSrc)
      .then((img) => {
        if (cancelled) return;
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workingSrc]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const renderCrop = useCallback(
    async (rect: Rect, maxEdge = 2000, quality = 0.92): Promise<Blob | null> => {
      const img = await loadImage(workingSrc).catch(() => null);
      if (!img) return null;
      const sx = Math.round(rect.x * img.naturalWidth);
      const sy = Math.round(rect.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
    },
    [workingSrc],
  );

  // Debounced thermal preview of the current crop.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const blob = await renderCrop(crop, 420, 0.85);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      try {
        const out = await ditherImage(url, 220);
        if (!cancelled) setPreview(out.dataUrl);
      } catch {
        /* preview optional */
      } finally {
        URL.revokeObjectURL(url);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [crop, renderCrop]);

  function beginDrag(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      rect: crop,
      boxW: box.width,
      boxH: box.height,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.boxW;
    const dy = (e.clientY - d.startY) / d.boxH;
    const r = d.rect;
    let next: Rect = { ...r };

    if (d.handle === "move") {
      next.x = clamp(r.x + dx, 0, 1 - r.w);
      next.y = clamp(r.y + dy, 0, 1 - r.h);
    } else {
      let left = r.x;
      let top = r.y;
      let right = r.x + r.w;
      let bottom = r.y + r.h;
      if (d.handle === "nw" || d.handle === "sw") left = clamp(r.x + dx, 0, right - MIN);
      if (d.handle === "ne" || d.handle === "se") right = clamp(right + dx, left + MIN, 1);
      if (d.handle === "nw" || d.handle === "ne") top = clamp(r.y + dy, 0, bottom - MIN);
      if (d.handle === "sw" || d.handle === "se") bottom = clamp(bottom + dy, top + MIN, 1);
      next = { x: left, y: top, w: right - left, h: bottom - top };
    }
    setCrop(next);
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  }

  async function rotate() {
    if (rotating) return;
    setRotating(true);
    try {
      const img = await loadImage(workingSrc);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob((b) => r(b), "image/jpeg", 0.92),
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setWorkingSrc((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
    } catch {
      /* ignore */
    } finally {
      setRotating(false);
    }
  }

  async function confirm() {
    const blob = await renderCrop(crop);
    if (!blob) return;
    await onConfirm(blob);
  }

  const aspect = natural ? natural.w / natural.h : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: "rgba(12,11,9,0.94)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="flex items-center justify-between px-4 text-xs uppercase tracking-widest"
        style={{ color: "var(--paper)" }}
      >
        <button type="button" onClick={onCancel} className="underline py-2">
          Cancel
        </button>
        <span style={{ opacity: 0.7 }}>Adjust photo</span>
        <button
          type="button"
          onClick={rotate}
          disabled={rotating || loadError}
          className="underline py-2 disabled:opacity-40"
        >
          ↻ Rotate
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-4">
        {loadError ? (
          <div className="text-sm" style={{ color: "var(--paper)" }}>
            Couldn't load this photo.
          </div>
        ) : (
          <div
            ref={boxRef}
            className="relative select-none"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: String(aspect),
              width: aspect >= 1 ? "100%" : "auto",
              height: aspect >= 1 ? "auto" : "100%",
              touchAction: "none",
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              src={workingSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* dimmed area outside the crop */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "rgba(12,11,9,0.6)",
                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)`,
              }}
            />

            <div
              onPointerDown={(e) => beginDrag("move", e)}
              className="absolute cursor-move"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                outline: "1px solid var(--paper)",
                touchAction: "none",
              }}
            >
              {/* rule of thirds */}
              <div className="absolute inset-0 pointer-events-none" aria-hidden>
                {[1, 2].map((i) => (
                  <div
                    key={`v${i}`}
                    className="absolute top-0 bottom-0"
                    style={{ left: `${(i * 100) / 3}%`, width: 1, background: "rgba(245,243,238,0.35)" }}
                  />
                ))}
                {[1, 2].map((i) => (
                  <div
                    key={`h${i}`}
                    className="absolute left-0 right-0"
                    style={{ top: `${(i * 100) / 3}%`, height: 1, background: "rgba(245,243,238,0.35)" }}
                  />
                ))}
              </div>

              {(["nw", "ne", "sw", "se"] as const).map((h) => (
                <div
                  key={h}
                  onPointerDown={(e) => beginDrag(h, e)}
                  className="absolute"
                  style={{
                    width: 28,
                    height: 28,
                    touchAction: "none",
                    left: h === "nw" || h === "sw" ? -14 : undefined,
                    right: h === "ne" || h === "se" ? -14 : undefined,
                    top: h === "nw" || h === "ne" ? -14 : undefined,
                    bottom: h === "sw" || h === "se" ? -14 : undefined,
                    cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      width: 14,
                      height: 14,
                      left: h === "nw" || h === "sw" ? 14 : 0,
                      right: h === "ne" || h === "se" ? 14 : 0,
                      top: h === "nw" || h === "ne" ? 14 : 0,
                      bottom: h === "sw" || h === "se" ? 14 : 0,
                      borderTop: h === "nw" || h === "ne" ? "2px solid var(--paper)" : undefined,
                      borderBottom: h === "sw" || h === "se" ? "2px solid var(--paper)" : undefined,
                      borderLeft: h === "nw" || h === "sw" ? "2px solid var(--paper)" : undefined,
                      borderRight: h === "ne" || h === "se" ? "2px solid var(--paper)" : undefined,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="text-[10px] uppercase tracking-widest shrink-0"
            style={{ color: "var(--paper)", opacity: 0.6 }}
          >
            On paper
          </div>
          <div
            className="flex-1 flex items-center justify-center py-2 px-2"
            style={{ backgroundColor: "var(--paper)", minHeight: 64 }}
          >
            {preview ? (
              <img src={preview} alt="" style={{ maxHeight: 72, width: "auto" }} />
            ) : (
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
                rendering…
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
            className="uppercase tracking-widest text-sm py-3 px-4 border"
            style={{ borderColor: "var(--paper)", color: "var(--paper)", touchAction: "manipulation" }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || loadError}
            className="flex-1 uppercase tracking-widest text-sm py-3 border disabled:opacity-40"
            style={{
              borderColor: "var(--paper)",
              backgroundColor: "var(--paper)",
              color: "var(--ink)",
              fontWeight: 700,
              touchAction: "manipulation",
            }}
          >
            {busy ? "Applying…" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
