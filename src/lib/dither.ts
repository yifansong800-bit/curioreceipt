// Thermal-receipt dither. Renders monochrome ink on transparent paper so the
// cream receipt background integrates with the artwork. Highlights and light
// midtones fade into the paper, while darks stay solid for recognizability.

const OUTPUT_SCALE = 2.4;
const CONTRAST = 1.18;
const BRIGHTNESS = 10;
const EDGE_STRENGTH = 0.22;

// Anything brighter than this is fully paper (transparent).
const PAPER_CUTOFF = 210;
// Anything darker than this is fully ink.
const INK_CUTOFF = 90;
// Ink opacity ceiling — slightly translucent so the paper tone shows through.
const INK_ALPHA_MAX = 225;
const INK_ALPHA_MIN = 130;

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
  // Keep a copy of the pre-diffusion tone to modulate ink alpha per pixel.
  const tone = new Float32Array(gray);
  atkinsonDiffuse(gray, w, h);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return { dataUrl: src, width: w, height: h };

  const output = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const ink = gray[i] < 128;

      // Fade ink toward transparent as the original tone approaches paper.
      let alpha = 0;
      if (ink) {
        const t = tone[i];
        if (t >= PAPER_CUTOFF) {
          alpha = 0;
        } else {
          const range = PAPER_CUTOFF - INK_CUTOFF;
          const norm = Math.max(0, Math.min(1, (PAPER_CUTOFF - t) / range));
          alpha = INK_ALPHA_MIN + (INK_ALPHA_MAX - INK_ALPHA_MIN) * norm;
          // Subtle thermal grain — tiny dropouts so ink reads as printed, not painted.
          if ((x * 17 + y * 31) % 191 === 0) alpha *= 0.4;
        }
      }

      output.data[p] = 0;
      output.data[p + 1] = 0;
      output.data[p + 2] = 0;
      output.data[p + 3] = Math.round(alpha);
    }
  }

  octx.putImageData(output, 0, 0);

  return { dataUrl: out.toDataURL("image/png"), width: w, height: h };
}

function buildEnhancedGrayscale(data: Uint8ClampedArray, w: number, h: number) {
  const base = new Float32Array(w * h);
  const enhanced = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    base[i] = clamp((luminance - 128) * CONTRAST + 128 + BRIGHTNESS);
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

const ATKINSON_THRESHOLD = 145;
const THRESHOLD_JITTER = 7;

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
      const threshold = ATKINSON_THRESHOLD + (((x * 13 + y * 7) % (THRESHOLD_JITTER * 2 + 1)) - THRESHOLD_JITTER);
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
