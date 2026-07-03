// Extract dominant colors from an image File, client-side.
// Returns up to 3 rgb() strings, ordered by frequency, skipping near-white/black.

export async function extractPalette(file: File, maxColors = 3): Promise<string[]> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, size, size);

    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 200) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // skip near-white / near-black / very desaturated grays
      if (max > 240 && min > 240) continue;
      if (max < 25) continue;
      // quantize to 5 bits per channel
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const cur = buckets.get(key);
      if (cur) {
        cur.r += r;
        cur.g += g;
        cur.b += b;
        cur.n += 1;
      } else {
        buckets.set(key, { r, g, b, n: 1 });
      }
    }

    const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
    const out: string[] = [];
    for (const c of sorted) {
      const r = Math.round(c.r / c.n);
      const g = Math.round(c.g / c.n);
      const b = Math.round(c.b / c.n);
      const rgb = `rgb(${r}, ${g}, ${b})`;
      // avoid near-duplicate colors
      if (out.some((prev) => colorDistance(prev, rgb) < 40)) continue;
      out.push(rgb);
      if (out.length >= maxColors) break;
    }
    return out;
  } catch {
    return [];
  }
}

function parseRgb(s: string): [number, number, number] {
  const m = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = parseRgb(a);
  const [br, bg, bb] = parseRgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}
