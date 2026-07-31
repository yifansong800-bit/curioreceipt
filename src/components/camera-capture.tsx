import { useCallback, useEffect, useRef, useState } from "react";
import { X, RotateCcw } from "lucide-react";

/**
 * In-page camera for "still at the museum" mode. Streams the rear camera
 * into a live viewfinder framed by the hand-drawn Curio frame, and hands
 * back a JPEG File on capture.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        console.error("[curio] camera unavailable", err);
        setError(
          "Camera unavailable. Check permissions, or close this and upload a photo instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url);
    };
  }, [shot]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    const file = new File([blob], `curio-snap-${Date.now()}.jpg`, { type: "image/jpeg" });
    setShot({ url: URL.createObjectURL(file), file });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 py-8"
      style={{ backgroundColor: "var(--ochre)", color: "#141414" }}
      role="dialog"
      aria-modal="true"
      aria-label="Snap the art in front of you"
    >
      <button
        type="button"
        onClick={() => {
          stop();
          onClose();
        }}
        aria-label="Close camera"
        className="absolute right-3 top-3 p-2"
        style={{ color: "#141414", touchAction: "manipulation" }}
      >
        <X className="h-5 w-5" />
      </button>

      <p className="mb-5 text-center text-[11px] tracking-[0.2em]">
        SNAP THE ART IN FRONT OF YOU
      </p>

      <div className="relative w-full" style={{ maxWidth: 320 }}>
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: "3 / 4", backgroundColor: "#141414" }}
        >
          {shot ? (
            <img src={shot.url} alt="Captured artwork" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
          )}
          {flash ? <div className="absolute inset-0" style={{ backgroundColor: "#fff" }} /> : null}
        </div>
        <svg
          className="pointer-events-none absolute"
          style={{ inset: "-9px" }}
          viewBox="0 0 100 133"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M4 6 C 26 3, 62 5, 96 3 C 97 38, 95 86, 97 129 C 66 127, 34 130, 3 128 C 5 90, 2 46, 4 6 Z"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {error ? (
        <p className="mt-6 max-w-xs text-center text-xs leading-relaxed">{error}</p>
      ) : shot ? (
        <div className="mt-7 flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(shot.url);
              setShot(null);
            }}
            className="inline-flex items-center gap-2 border px-4 py-2 text-xs uppercase tracking-widest"
            style={{ borderColor: "#141414", touchAction: "manipulation" }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> retake
          </button>
          <button
            type="button"
            onClick={() => {
              stop();
              onCapture(shot.file);
            }}
            className="border px-5 py-2 text-xs uppercase tracking-widest"
            style={{
              borderColor: "#141414",
              backgroundColor: "#141414",
              color: "var(--paper)",
              touchAction: "manipulation",
            }}
          >
            use this photo →
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="mt-7 rounded-full transition-transform active:scale-95 disabled:opacity-40"
          style={{
            width: 64,
            height: 64,
            border: "3px solid #141414",
            backgroundColor: "transparent",
            touchAction: "manipulation",
          }}
        />
      )}
    </div>
  );
}
