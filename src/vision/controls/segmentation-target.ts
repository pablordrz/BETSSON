import type { Rel } from '../../config/game-layout';
import { buttonLikeness, MIN_SPIN_RADIUS, grayAt, localMean } from './raster';
import type { ScreenTarget, TargetMatch } from './screen-target';

export interface SegmentationOptions {
  region?: Rel;
  /** Radius range as a fraction of the frame width. */
  minRadius?: number;
  maxRadius?: number;
  workWidth?: number;
  /** A pixel is "button" if it is this much darker than its neighbourhood (0–255). */
  darkerBy?: number;
  /** Erosion passes before grouping (each removes 1 px from the border of every region). */
  erode?: number;
  minScore?: number;
}

/**
 * Image segmentation: split the picture into "darker than its surroundings" regions (adaptive threshold),
 * group them into connected components, and keep the components SHAPED like a round button (square bounding box,
 * disk-like fill) that also look like one (bright icon strokes inside). Cheap and template-free.
 */
export class SegmentationTarget implements ScreenTarget {
  constructor(
    readonly name: string,
    private readonly opts: SegmentationOptions = {},
  ) {}

  async locate(frame: Buffer): Promise<TargetMatch | null> {
    const W = this.opts.workWidth ?? 400;
    const g = await grayAt(frame, W);
    const region = this.opts.region ?? { x: 0, y: 0.4, w: 1, h: 0.6 };
    const rx0 = Math.floor(region.x * g.w);
    const ry0 = Math.floor(region.y * g.h);
    const rx1 = Math.min(g.w, Math.ceil((region.x + region.w) * g.w));
    const ry1 = Math.min(g.h, Math.ceil((region.y + region.h) * g.h));
    const rMin = (this.opts.minRadius ?? MIN_SPIN_RADIUS) * g.w;
    const rMax = (this.opts.maxRadius ?? 0.05) * g.w;

    // 1) segmentation: darker than the local mean (neighbourhood ~3× the largest button radius)
    const mean = localMean(g, Math.round(rMax * 3));
    const darkerBy = this.opts.darkerBy ?? 25;
    const mask = new Uint8Array(g.w * g.h);
    for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
      const i = y * g.w + x;
      if (g.data[i] < mean[i] - darkerBy) mask[i] = 1;
    }

    // 1b) morphological erosion: breaks thin bridges between the button and dark artwork it touches
    const erodeBy = this.opts.erode ?? 0; // off by default: the icon leaves the disk as a thin ring that erosion also breaks
    for (let pass = 0; pass < erodeBy; pass++) {
      const prev = mask.slice();
      for (let y = ry0 + 1; y < ry1 - 1; y++) for (let x = rx0 + 1; x < rx1 - 1; x++) {
        const i = y * g.w + x;
        if (prev[i] && !(prev[i - 1] && prev[i + 1] && prev[i - g.w] && prev[i + g.w])) mask[i] = 0;
      }
    }

    // 2) connected components (4-neighbourhood, iterative flood fill)
    const label = new Int32Array(g.w * g.h);
    const stack: number[] = [];
    let best: { x: number; y: number; r: number; score: number } | null = null;
    let next = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || label[start]) continue;
      next++;
      let area = 0;
      let x0 = g.w;
      let y0 = g.h;
      let x1 = -1;
      let y1 = -1;
      stack.push(start);
      label[start] = next;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % g.w;
        const y = (i - x) / g.w;
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const j of [i - 1, i + 1, i - g.w, i + g.w]) {
          if (j >= 0 && j < mask.length && mask[j] && !label[j] && Math.abs((j % g.w) - x) <= 1) {
            label[j] = next;
            stack.push(j);
          }
        }
      }
      // 3) shape: round (square box), right size, disk-like fill (the icon leaves holes, so not 100%)
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const r = (bw + bh) / 4 + erodeBy; // the eroded border is added back
      if (r < rMin || r > rMax) continue;
      const aspect = Math.min(bw, bh) / Math.max(bw, bh);
      const re = r - erodeBy;
      const fill = area / (Math.PI * re * re);
      if (aspect < 0.8 || fill < 0.35 || fill > 1.1) continue;
      // 4) appearance: dark disk with bright strokes inside
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const score = aspect * Math.min(1, fill / 0.6) * buttonLikeness(g, cx, cy, r);
      // among components that are clearly buttons, the biggest one is the spin button
      if (score >= (this.opts.minScore ?? 0.5) && (!best || r > best.r)) best = { x: cx, y: cy, r, score };
    }
    if (!best || best.score < (this.opts.minScore ?? 0.5)) return null;
    return {
      x: (best.x + 0.5) / g.w,
      y: (best.y + 0.5) / g.h,
      score: best.score,
      detail: `${this.name} found by segmentation at (${((best.x + 0.5) / g.w).toFixed(2)}, ${((best.y + 0.5) / g.h).toFixed(2)}), r ${((best.r / g.w) * 100).toFixed(1)}% width, score ${best.score.toFixed(2)}`,
    };
  }
}
