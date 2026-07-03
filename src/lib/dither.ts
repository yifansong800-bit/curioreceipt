// Thermal-receipt dither. Keeps the output monochrome/transparent like ink on
// paper, but processes at high resolution with local contrast and Atkinson
// diffusion so artworks stay recognizable instead of turning into coarse dots.

const OUTPUT_SCALE = 2.4;
const CONTRAST = 1.28;
const BRIGHTNESS = 7;
const EDGE_STRENGTH = 0.18;
const HIGHLIGHT_ALPHA_CUTOFF = 242;
const INK_ALPHA = 235;

export async function ditherImage(
  src: string,
  targetWidth = 220,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(src);
  const outputWidth = Math.max(1, Math.round(targetWidth * OUTPUT_SCALE));
  const ratio = img.width > 0 ? outputWidth / img.width : 1;
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));

  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { dataUrl: src, width: w, height: h };
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(img, 0, 0, w, h);

  const sourceImage = sctx.getImageData(0, 0, w, h);
  const gray = buildEnhancedGrayscale(sourceImage.data, w, h);
  atkinsonDiffuse(gray, w, h);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return { dataUrl: src, width: w, height: h };

  const output = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const band = y % 9 === 0 ? 18 : y % 5 === 0 ? 8 : 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const ink = gray[i] < 128;
      const paperHighlight = gray[i] > HIGHLIGHT_ALPHA_CUTOFF;
      const dropout = ((x * 17 + y * 31) % 127 === 0) || (band > 0 && (x + y) % 19 === 0);

      output.data[p] = 0;
      output.data[p + 1] = 0;
      output.data[p + 2] = 0;
      output.data[p + 3] = ink && !paperHighlight && !dropout
        ? Math.max(185, INK_ALPHA - band)
        : 0;
    }
  }

  octx.putImageData(output, 0, 0);

  return { dataUrl: out.toDataURL("image/png"), width: w, height: h };
}

function buildEnhancedGrayscale(data: Uint8ClampedArray, w: number, h: number) {
  const base = new Float32Array(w * h);
  const enhanced = new Float32Array(w * h);
  const factor = (259 * (CONTRAST * 255 + 255)) / (255 * (259 - CONTRAST * 255));

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    base[i] = clamp(factor * (luminance - 128) + 128 + BRIGHTNESS);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const left = base[y * w + Math.max(0, x - 1)];
      const right = base[y * w + Math.min(w - 1, x + 1)];
      const top = base[Math.max(0, y - 1) * w + x];
      const bottom = base[Math.min(h - 1, y + 1) * w + x];
      const blur = (left + right + top + bottom) / 4;
      enhanced[i] = clamp(base[i] + (base[i] - blur) * EDGE_STRENGTH);
    }
  }

  return enhanced;
}

function atkinsonDiffuse(gray: Float32Array, w: number, h: number) {
  const spread = (x: number, y: number, error: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      gray[y * w + x] = clamp(gray[y * w + x] + error / 8);
    }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const threshold = 126 + (((x * 13 + y * 7) % 11) - 5);
      const next = old < threshold ? 0 : 255;
      const error = old - next;
      gray[i] = next;

      spread(x + 1, y, error);
      spread(x + 2, y, error);
      spread(x - 1, y + 1, error);
      spread(x, y + 1, error);
      spread(x + 1, y + 1, error);
      spread(x, y + 2, error);
    }
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
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
