import { useCallback, useEffect, useRef, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import shutter from "@/assets/curio-button.png.asset.json";
import { SnapIcon } from "@/components/pixel-icons";

/**
 * In-page camera for "still at the museum" mode. Streams the rear camera
 * into a live viewfinder and hands back a JPEG File on capture.
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
  // Bumped on retry so the stream is re-acquired if the track was released.
  const [session, setSession] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
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
        setError(null);
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
  }, [stop, session]);

  // Full-screen: nothing behind the camera should scroll into view.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  function retry() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    const live = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
    if (live && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    } else {
      stop();
      setSession((s) => s + 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden px-6"
      style={{
        height: "100dvh",
        backgroundColor: "var(--ochre)",
        color: "#141414",
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
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
        SHOW ME THE PIECE YOU COULDN'T WALK PAST
      </p>

      <div className="relative w-full" style={{ maxWidth: 320 }}>
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: "3 / 4",
            backgroundColor: "#141414",
            border: "1.5px solid #141414",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
          {shot ? (
            <img
              src={shot.url}
              alt="Captured artwork"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {flash ? <div className="absolute inset-0" style={{ backgroundColor: "#fff" }} /> : null}
        </div>
      </div>

      {error ? (
        <p className="mt-6 max-w-xs text-center text-xs leading-relaxed">{error}</p>
      ) : shot ? (
        <div className="mt-7 flex items-center gap-4">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 border px-4 py-2 text-xs uppercase tracking-widest"
            style={{ borderColor: "#141414", touchAction: "manipulation" }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> let me retry
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
            this is the one →
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="mt-7 transition-transform active:scale-95 disabled:opacity-40"
          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        >
          <img src={star.url} alt="" aria-hidden width={78} height={78} draggable={false} />
        </button>
      )}
    </div>
  );
}
