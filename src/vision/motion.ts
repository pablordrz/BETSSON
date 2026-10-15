import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { sleep } from '../utils/text';

const WIDTH = 320;

async function toRaw(png: Buffer) {
  const { data, info } = await sharp(png)
    .resize({ width: WIDTH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Fraction of pixels that changed between two frames (0..1). */
export async function diffRatio(a: Buffer, b: Buffer): Promise<number> {
  const [A, B] = await Promise.all([toRaw(a), toRaw(b)]);
  if (A.w !== B.w || A.h !== B.h) return 1;
  const changed = pixelmatch(A.data, B.data, null, A.w, A.h, { threshold: 0.15 });
  return changed / (A.w * A.h);
}

type Capture = () => Promise<Buffer>;

/** Max frame-to-frame change while idle (slots have idle animations — we must not mistake them for a spin). */
export async function measureIdleNoise(capture: Capture, durationMs = 2000, intervalMs = 250): Promise<number> {
  let prev = await capture();
  let max = 0;
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    await sleep(intervalMs);
    const cur = await capture();
    max = Math.max(max, await diffRatio(prev, cur));
    prev = cur;
  }
  return max;
}

export interface MotionResult {
  moved: boolean;
  peak: number;
  threshold: number;
  /** Frame where motion was first detected (evidence). */
  frame?: Buffer;
}

/** Waits for the reels to visibly move (change above the idle-noise threshold). */
export async function waitForMotion(
  capture: Capture,
  opts: { threshold: number; timeoutMs?: number; intervalMs?: number; baseline?: Buffer },
): Promise<MotionResult> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 150;
  const base = opts.baseline ?? (await capture());
  let prev = base;
  let peak = 0;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await sleep(intervalMs);
    const cur = await capture();
    // compare both with previous frame (spinning blur) and with the pre-spin baseline (symbols changed)
    const d = Math.max(await diffRatio(prev, cur), await diffRatio(base, cur));
    peak = Math.max(peak, d);
    if (d > opts.threshold) return { moved: true, peak, threshold: opts.threshold, frame: cur };
    prev = cur;
  }
  return { moved: false, peak, threshold: opts.threshold };
}

export interface StableResult {
  stable: boolean;
  elapsedMs: number;
  lastDiff: number;
  frame: Buffer;
}

/** Waits until N consecutive frames are (almost) identical → the spin has visually settled. */
export async function waitForStable(
  capture: Capture,
  opts: { threshold: number; consecutive?: number; timeoutMs?: number; intervalMs?: number },
): Promise<StableResult> {
  const consecutive = opts.consecutive ?? 4;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 400;
  const start = Date.now();
  let prev = await capture();
  let calm = 0;
  let lastDiff = 1;
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    const cur = await capture();
    lastDiff = await diffRatio(prev, cur);
    calm = lastDiff <= opts.threshold ? calm + 1 : 0;
    prev = cur;
    if (calm >= consecutive) return { stable: true, elapsedMs: Date.now() - start, lastDiff, frame: cur };
  }
  return { stable: false, elapsedMs: Date.now() - start, lastDiff, frame: prev };
}
