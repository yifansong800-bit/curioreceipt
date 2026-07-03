// Circular dot halftone. Loads an image, downsamples, then renders it as a
// grid of solid black circles whose radius scales with local darkness.
// Highlights above HIGHLIGHT_CUTOFF are left transparent so the cream paper
// shows through — matching classic newsprint/risograph halftone aesthetics.

const CELL = 4; // grid cell size in output px (smaller = finer dots)
const HIGHLIGHT_CUTOFF = 0.8; // avg luminance above this → blank cell
const GAMMA = 0.5; // sqrt-ish curve for radius mapping
const SUPERSAMPLE = 3; // internal render scale for smooth circle edges

export async function ditherImage(
  src: string,
  targetWidth = 220,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(src);
  const ratio = img.width > 0 ? targetWidth / img.width : 1;
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));

  // Sample luminance on a low-res canvas at output resolution.
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = w;
  sampleCanvas.height = h;
  const sctx = sampleCanvas.getContext("2d");
  if (!sctx) return { dataUrl: src, width: w, height: h };
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(img, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);

  // Render circles on a supersampled canvas, then downscale for smooth edges.
  const outW = w * SUPERSAMPLE;
  const outH = h * SUPERSAMPLE;
  const hi = document.createElement("canvas");
  hi.width = outW;
  hi.height = outH;
  const hctx = hi.getContext("2d");
  if (!hctx) return { dataUrl: src, width: w, height: h };
  hctx.clearRect(0, 0, outW, outH);
  hctx.fillStyle = "#000";

  const maxR = (CELL / 2) * SUPERSAMPLE;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * CELL;
      const y0 = cy * CELL;
      const x1 = Math.min(w, x0 + CELL);
      const y1 = Math.min(h, y0 + CELL);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          count++;
        }
      }
      if (count === 0) continue;
      const avgL = sum / (count * 255);
      if (avgL >= HIGHLIGHT_CUTOFF) continue; // blank → paper shows through

      const density = Math.max(0, Math.min(1, (HIGHLIGHT_CUTOFF - avgL) / HIGHLIGHT_CUTOFF));
      const radius = maxR * Math.pow(density, GAMMA);
      if (radius <= 0.2) continue;

      const px = (x0 + CELL / 2) * SUPERSAMPLE;
      const py = (y0 + CELL / 2) * SUPERSAMPLE;
      hctx.beginPath();
      hctx.arc(px, py, radius, 0, Math.PI * 2);
      hctx.fill();
    }
  }

  // Downscale to final size for anti-aliased circle edges.
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return { dataUrl: src, width: w, height: h };
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.clearRect(0, 0, w, h);
  octx.drawImage(hi, 0, 0, w, h);

  return { dataUrl: out.toDataURL("image/png"), width: w, height: h };
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
