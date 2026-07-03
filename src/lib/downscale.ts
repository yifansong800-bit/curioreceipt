// Downscale an image File/Blob to a max longest-edge via canvas, returning a JPEG Blob.
export async function downscaleImage(
  file: Blob,
  maxEdge = 2000,
  quality = 0.85,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load image"));
      el.src = url;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) throw new Error("Invalid image dimensions");
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, outW, outH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) throw new Error("Encode failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
