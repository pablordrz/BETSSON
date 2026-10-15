/**
 * Where things are inside the provider canvas, as FRACTIONS of the canvas (resolution independent).
 * These regions only narrow down where OCR / motion detection look; the values themselves
 * are always read from the screen. CALIBRATE with the calibration run (annotated screenshots).
 */
export interface Rel {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameLayout {
  /** Matches the URL of the provider iframe. */
  frameUrl: RegExp;
  /** Bottom bar with CREDIT / BET / WIN. */
  hud: Rel;
  /** Reel area, used to detect that a spin really started and settled. */
  reels: Rel;
  /** Fallback spin button position (centre), only used if template + keyboard fail. */
  spinButton: { x: number; y: number };
  /** Ordered strategies used to trigger a spin. */
  spinStrategies: Array<'template' | 'keyboard' | 'click'>;
}

function parseRel(v: string | undefined): { x: number; y: number } | undefined {
  if (!v) return undefined;
  const [x, y] = v.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export const pragmaticLayout: GameLayout = {
  frameUrl: /pragmaticplay|ppgames|pragmatic|gs2c|html5Game/i,
  hud: { x: 0, y: 0.8, w: 1, h: 0.2 },
  reels: { x: 0.18, y: 0.12, w: 0.64, h: 0.6 },
  spinButton: parseRel(process.env.SPIN_REL) ?? { x: 0.9, y: 0.5 },
  spinStrategies: (process.env.SPIN_STRATEGIES ?? 'template,keyboard,click')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is 'template' | 'keyboard' | 'click' => ['template', 'keyboard', 'click'].includes(s)),
};
