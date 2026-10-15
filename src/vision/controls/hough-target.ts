import type { Rel } from '../../config/game-layout';
import { buttonLikeness, MIN_SPIN_RADIUS, grayAt, sobel } from './raster';
import type { ScreenTarget, TargetMatch } from './screen-target';

export interface HoughOptions {
  /** Where to look (fractions of the frame). Spin buttons live in the lower part of slot games. */
  region?: Rel;
  /** Radius range as a fraction of the frame width. */
  minRadius?: number;
  maxRadius?: number;
  /** Working width (smaller = faster, less precise). */
  workWidth?: number;
  /** Minimum combined score (circle evidence × button likeness) to report a match. */
  minScore?: number;
}

/**
 * Circle Hough transform on Sobel edges: every strong edge votes for the centres that lie along its gradient
 * direction, for every radius in range. The best-supported circles are then VERIFIED as buttons (dark disk with
 * bright strokes inside) so coins and bubbles do not win. No template needed: works for round buttons it has
 * never seen, at any size.
 */
export class HoughCircleTarget implements ScreenTarget {
  constructor(
    readonly name: string,
    private readonly opts: HoughOptions = {},
  ) {}

  async locate(frame: Buffer): Promise<TargetMatch | null> {
    const W = this.opts.workWidth ?? 400;
    const g = await grayAt(frame, W);
    const region = this.opts.region ?? { x: 0, y: 0.4, w: 1, h: 0.6 };
    const rx0 = Math.floor(region.x * g.w);
    const ry0 = Math.floor(region.y * g.h);
    const rx1 = Math.min(g.w, Math.ceil((region.x + region.w) * g.w));
    const ry1 = Math.min(g.h, Math.ceil((region.y + region.h) * g.h));
    const rMin = Math.max(4, Math.round((this.opts.minRadius ?? MIN_SPIN_RADIUS) * g.w));
    const rMax = Math.max(rMin + 1, Math.round((this.opts.maxRadius ?? 0.05) * g.w));
    const nR = rMax - rMin + 1;

    const { mag, dx, dy } = sobel(g);
    // strong edges only: above the 85th percentile of the region's gradient magnitudes
    const mags: number[] = [];
    for (let y = ry0; y < ry1; y += 2) for (let x = rx0; x < rx1; x += 2) mags.push(mag[y * g.w + x]);
    mags.sort((a, b) => a - b);
    const edgeT = Math.max(40, mags[Math.floor(mags.length * 0.85)] ?? 40);

    const acc = new Uint16Array(g.w * g.h * nR);
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const i = y * g.w + x;
        if (mag[i] < edgeT) continue;
        for (let k = 0; k < nR; k++) {
          const r = rMin + k;
          // the centre is along the gradient, on either side (dark disk on light ground or the opposite)
          for (const s of [-1, 1]) {
            const cx = Math.round(x + s * r * dx[i]);
            const cy = Math.round(y + s * r * dy[i]);
            if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
            acc[(cy * g.w + cx) * nR + k]++;
          }
        }
      }
    }

    // candidates: best radius per centre, normalised by circumference (fraction of the circle supported by edges)
    const candidates: Array<{ x: number; y: number; r: number; support: number }> = [];
    // every (centre, radius) with enough support: a button has several concentric circles (rim, icon), and the
    // strongest one is often the icon inside — it must not hide the disk's own rim
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        for (let k = 0; k < nR; k++) {
          const v = acc[(y * g.w + x) * nR + k] / (2 * Math.PI * (rMin + k));
          if (v >= 0.35) candidates.push({ x, y, r: rMin + k, support: Math.min(1, v) });
        }
      }
    }
    candidates.sort((a, b) => b.support - a.support);

    // verify the strongest circles; suppress only near-duplicates (same centre AND similar radius)
    const kept: typeof candidates = [];
    let winner: { x: number; y: number; r: number; score: number } | null = null;
    for (const c of candidates) {
      if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < k.r * 0.5 && Math.abs(k.r - c.r) <= k.r * 0.2)) continue;
      kept.push(c);
      const score = c.support * buttonLikeness(g, c.x, c.y, c.r);
      // among circles that are clearly buttons, the biggest one is the spin button
      if (score >= (this.opts.minScore ?? 0.3) && (!winner || c.r > winner.r || (c.r === winner.r && score > winner.score))) {
        winner = { x: c.x, y: c.y, r: c.r, score };
      }
      if (kept.length >= 60) break;
    }
    if (!winner || winner.score < (this.opts.minScore ?? 0.3)) return null;
    return {
      x: (winner.x + 0.5) / g.w,
      y: (winner.y + 0.5) / g.h,
      score: winner.score,
      detail: `${this.name} found by circle Hough at (${((winner.x + 0.5) / g.w).toFixed(2)}, ${((winner.y + 0.5) / g.h).toFixed(2)}), r ${((winner.r / g.w) * 100).toFixed(1)}% width, score ${winner.score.toFixed(2)}`,
    };
  }
}
