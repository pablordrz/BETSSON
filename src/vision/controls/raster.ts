import sharp from 'sharp';

/**
 * The spin button is the BIGGEST round control of a slot (≈2.5–3 % of the width); bet ±, info and menu buttons
 * are ≈1–1.3 %. Shape alone cannot tell them apart, size can.
 */
export const MIN_SPIN_RADIUS = 0.018;

/** Greyscale raster at a working width (small = fast; positions are later reported as fractions). */
export interface Gray {
  data: Uint8Array;
  w: number;
  h: number;
}

export async function grayAt(png: Buffer, width: number): Promise<Gray> {
  const { data, info } = await sharp(png).greyscale().resize({ width }).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

/** Box blur via an integral image: local mean around every pixel (O(1) per pixel, any radius). */
export function localMean(g: Gray, radius: number): Float32Array {
  const { w, h, data } = g;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Sobel gradient: magnitude and unit direction per pixel. */
export function sobel(g: Gray): { mag: Float32Array; dx: Float32Array; dy: Float32Array } {
  const { w, h, data } = g;
  const mag = new Float32Array(w * h);
  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (yy: number, xx: number) => data[(y + yy) * w + x + xx];
      const gx = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      const gy = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const m = Math.hypot(gx, gy);
      const i = y * w + x;
      mag[i] = m;
      if (m > 0) {
        dx[i] = gx / m;
        dy[i] = gy / m;
      }
    }
  }
  return { mag, dx, dy };
}

/**
 * "Is this a round button?" check shared by the shape-based detectors: a disk that is DARKER than the ring just
 * outside it, with BRIGHT strokes inside (the icon). Coins, bubbles and petals are bright inside, so they fail it.
 * Returns 0 (not a button) .. 1 (clearly a button).
 */
export function buttonLikeness(g: Gray, cx: number, cy: number, r: number): number {
  const inner: number[] = [];
  const ring: number[] = [];
  let bright = 0;
  const R = Math.ceil(r * 1.45);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(g.h - 1, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(g.w - 1, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const v = g.data[y * g.w + x];
      if (d <= r * 0.85) {
        inner.push(v);
        if (v > 200) bright++;
      } else if (d >= r * 1.15 && d <= r * 1.45) ring.push(v);
    }
  }
  if (!inner.length || !ring.length) return 0;
  const pct = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
  // the disk's own colour = the darker part of the interior (the bright icon strokes would bias a plain mean)
  const disk = pct(inner, 0.3);
  const ground = pct(ring, 0.5);
  const brightFrac = bright / inner.length;
  const darker = Math.min(1, Math.max(0, (ground - disk - 15) / 60)); // disk darker than its surroundings
  const icon = brightFrac >= 0.04 && brightFrac <= 0.55 ? 1 : 0; // some bright strokes, not a bright blob
  return darker * icon;
}
