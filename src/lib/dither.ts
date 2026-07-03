// Floyd–Steinberg 1-bit dither. Loads an image, downsamples to a target width,
// converts to grayscale, applies error diffusion, and returns a PNG data URL.
export async function ditherImage(
  src: string,
  targetWidth = 220,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(src);
  const ratio = img.width > 0 ? targetWidth / img.width : 1;
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: src, width: targetWidth, height: targetWidth };
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data.data[i * 4];
    const g = data.data[i * 4 + 1];
    const b = data.data[i * 4 + 2];
    // luminance + slight contrast boost so mid-tones dither cleanly
    let v = 0.299 * r + 0.587 * g + 0.114 * b;
    v = (v - 128) * 1.15 + 128;
    gray[i] = Math.max(0, Math.min(255, v));
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const nw = old < 128 ? 0 : 255;
      gray[idx] = nw;
      const err = old - nw;
      if (x + 1 < w) gray[idx + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) gray[idx + w - 1] += (err * 3) / 16;
        gray[idx + w] += (err * 5) / 16;
        if (x + 1 < w) gray[idx + w + 1] += (err * 1) / 16;
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    const v = gray[i] > 127 ? 255 : 0;
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
