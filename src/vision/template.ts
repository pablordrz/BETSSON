import fs from 'node:fs';
import sharp from 'sharp';

/**
 * Template matching by zero-mean normalised cross-correlation (ZNCC) on greyscale: insensitive to brightness and
 * contrast, and flat areas score 0 (no false matches on plain backgrounds). Used to find controls visually
 * (e.g. Pragmatic's round spin icon) instead of clicking fixed coordinates.
 */
const WORK_WIDTH = 720;
/** Templates smaller than this (in work pixels) carry too little detail to be told apart from noise. */
const MIN_TEMPLATE_PX = 14;

async function grey(png: Buffer, width: number) {
  const { data, info } = await sharp(png).greyscale().resize({ width }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

export interface TemplateMatch {
  score: number; // ZNCC: 1 = identical pattern, 0 = unrelated
  x: number; // centre, fraction of screen width
  y: number; // centre, fraction of screen height
}

export interface TemplateOptions {
  /** Template size relative to its original size on a screen of the same width (multi-scale search). */
  scale?: number;
  /** Only compare pixels inside the inscribed circle: round buttons on any background. */
  circular?: boolean;
  /** Only search for the template's CENTRE inside this region (fractions of the screen): fast re-checks. */
  region?: { x: number; y: number; w: number; h: number };
}

export async function findTemplate(screen: Buffer, template: Buffer, opts: TemplateOptions = {}): Promise<TemplateMatch> {
  const none = { score: -1, x: 0, y: 0 };
  const sMeta = await sharp(screen).metadata();
  const tMeta = await sharp(template).metadata();
  const workWidth = Math.min(WORK_WIDTH, sMeta.width ?? WORK_WIDTH);
  const factor = workWidth / (sMeta.width ?? workWidth);
  const tw = Math.round((tMeta.width ?? 40) * factor * (opts.scale ?? 1));
  if (tw < MIN_TEMPLATE_PX) return none;
  const S = await grey(screen, workWidth);
  const T = await grey(template, tw);
  if (T.w > S.w || T.h > S.h) return none;

  // template samples (zero-mean), optionally restricted to the inscribed circle
  const cx = (T.w - 1) / 2;
  const cy = (T.h - 1) / 2;
  const r2 = Math.min(cx, cy) ** 2;
  const offs: number[] = [];
  const tv: number[] = [];
  for (let ty = 0; ty < T.h; ty++) {
    for (let tx = 0; tx < T.w; tx++) {
      if (opts.circular && (tx - cx) ** 2 + (ty - cy) ** 2 > r2) continue;
      offs.push(ty * S.w + tx);
      tv.push(T.data[ty * T.w + tx]);
    }
  }
  const n = tv.length;
  const tMean = tv.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) tv[i] -= tMean;
  const tNorm = Math.sqrt(tv.reduce((a, b) => a + b * b, 0));
  if (tNorm === 0) return none;

  const zncc = (x: number, y: number) => {
    const base = y * S.w + x;
    let sum = 0;
    let sumSq = 0;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const v = S.data[base + offs[i]];
      sum += v;
      sumSq += v * v;
      cross += v * tv[i];
    }
    const varS = sumSq - (sum * sum) / n;
    return varS <= 1e-6 ? 0 : cross / (Math.sqrt(varS) * tNorm);
  };

  // search window for the template's top-left corner (whole screen, or around a known position)
  const r = opts.region;
  const xMin = r ? Math.max(0, Math.floor(r.x * S.w - T.w / 2)) : 0;
  const yMin = r ? Math.max(0, Math.floor(r.y * S.h - T.h / 2)) : 0;
  const xMax = r ? Math.min(S.w - T.w, Math.ceil((r.x + r.w) * S.w - T.w / 2)) : S.w - T.w;
  const yMax = r ? Math.min(S.h - T.h, Math.ceil((r.y + r.h) * S.h - T.h / 2)) : S.h - T.h;

  // coarse grid (every 3 px), then refine pixel by pixel around the TOP candidates — not only the best one: a target
  // that falls between grid points can score below a decoy on the coarse grid and only win once refined
  const TOP = 5;
  const top: Array<{ score: number; x: number; y: number }> = [];
  for (let y = yMin; y <= yMax; y += 3) {
    for (let x = xMin; x <= xMax; x += 3) {
      const score = zncc(x, y);
      if (top.length < TOP || score > top[top.length - 1].score) {
        // keep distinct places only (neighbours of a kept cell are the same candidate)
        const near = top.findIndex((c) => Math.abs(c.x - x) <= 3 && Math.abs(c.y - y) <= 3);
        if (near >= 0) {
          if (score > top[near].score) top[near] = { score, x, y };
        } else top.push({ score, x, y });
        top.sort((a, b) => b.score - a.score);
        if (top.length > TOP) top.pop();
      }
    }
  }
  let best = top[0] ?? { score: -1, x: 0, y: 0 };
  for (const c of top) {
    for (let y = Math.max(0, c.y - 2); y <= Math.min(S.h - T.h, c.y + 2); y++) {
      for (let x = Math.max(0, c.x - 2); x <= Math.min(S.w - T.w, c.x + 2); x++) {
        const score = zncc(x, y);
        if (score > best.score) best = { score, x, y };
      }
    }
  }
  return { score: best.score, x: (best.x + T.w / 2) / S.w, y: (best.y + T.h / 2) / S.h };
}

export function loadTemplate(file: string): Buffer | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}
