import { normalize } from '../../utils/text';
import { imageSize } from '../game-screen';
import type { Ocr } from '../ocr';
import { findTemplate, loadTemplate, type TemplateMatch } from '../template';

/** Where a target was found, as fractions of the game canvas, and how it was found (for the report). */
export interface TargetMatch {
  x: number;
  y: number;
  score: number;
  detail: string;
}

/**
 * Something the player can see on the game screen (a button, a label). Implementations decide HOW to find it
 * in a frame (image, text, …); callers only ask WHERE it is. Returns null when it is not visible.
 */
export interface ScreenTarget {
  readonly name: string;
  locate(frame: Buffer): Promise<TargetMatch | null>;
}

/** ZNCC score above which a match is unambiguous. */
const CLEAR_MATCH = 0.95;

/** Finds an icon by image (multi-scale template matching), e.g. Pragmatic's round spin/continue arrows. */
export class TemplateTarget implements ScreenTarget {
  private readonly template: Buffer;
  /** Best candidate of the last search, even when below the threshold (diagnostics for the report). */
  lastBest?: { score: number; x: number; y: number; scale: number };
  /** Where and at which size it was last found. */
  private lastFound?: { x: number; y: number; scale: number };

  constructor(
    readonly name: string,
    templateFile: string,
    private readonly opts: { minScore?: number; minScale?: number; maxScale?: number; circular?: boolean } = {},
  ) {
    const tpl = loadTemplate(templateFile);
    if (!tpl) throw new Error(`Template not found: ${templateFile}`);
    this.template = tpl;
  }

  /**
   * Fast path: where and at which size the icon was last found (a game's controls do not move between spins).
   * Falls back to the full multi-scale search when it is not there.
   */
  async locate(frame: Buffer): Promise<TargetMatch | null> {
    const known = this.lastFound;
    if (known) {
      const region = { x: known.x - 0.04, y: known.y - 0.04, w: 0.08, h: 0.08 };
      let best: (TemplateMatch & { scale: number }) | null = null;
      for (const scale of [known.scale, known.scale * 0.97, known.scale * 1.03]) {
        const m = await findTemplate(frame, this.template, { scale, circular: this.opts.circular, region });
        if (!best || m.score > best.score) best = { ...m, scale };
        if (best.score >= CLEAR_MATCH) break;
      }
      if (best && best.score >= (this.opts.minScore ?? 0.7)) {
        return { x: best.x, y: best.y, score: best.score, detail: `${this.name} seen again at (${best.x.toFixed(2)}, ${best.y.toFixed(2)}), score ${best.score.toFixed(2)}` };
      }
    }
    return this.search(frame);
  }

  /** Coarse-to-fine multi-scale search: the icon's size depends on the game and the window size. */
  private async search(frame: Buffer): Promise<TargetMatch | null> {
    const minScore = this.opts.minScore ?? 0.7; // ZNCC
    // most likely size first (1 = as captured), then alternately smaller/larger: a clear match stops early
    const coarse: number[] = [1];
    for (let k = 1; ; k++) {
      const smaller = 1 / 1.1 ** k;
      const larger = 1.1 ** k;
      const inRange = [smaller >= (this.opts.minScale ?? 0.4) ? smaller : null, larger <= (this.opts.maxScale ?? 2.5) ? larger : null];
      if (inRange.every((v) => v === null)) break;
      coarse.push(...inRange.filter((v): v is number => v !== null));
    }
    let best = await this.bestOf(frame, coarse);
    if (best.score < CLEAR_MATCH) best = await this.bestOf(frame, [0.95, 0.975, 1.025, 1.05].map((f) => best.scale * f), best);
    this.lastBest = { score: best.score, x: best.x, y: best.y, scale: best.scale };
    if (best.score < minScore) return null;
    this.lastFound = { x: best.x, y: best.y, scale: best.scale };
    return {
      x: best.x,
      y: best.y,
      score: best.score,
      detail: `${this.name} found by image at (${best.x.toFixed(2)}, ${best.y.toFixed(2)}), score ${best.score.toFixed(2)}, scale ${best.scale.toFixed(2)}`,
    };
  }

  private async bestOf(frame: Buffer, scales: number[], start?: TemplateMatch & { scale: number }) {
    let best = start ?? { score: -1, x: 0, y: 0, scale: 1 };
    for (const scale of scales) {
      const m = await findTemplate(frame, this.template, { scale, circular: this.opts.circular });
      if (m.score > best.score) best = { ...m, scale };
      if (best.score >= CLEAR_MATCH) break; // unambiguous: no need to try other sizes
    }
    return best;
  }
}

/** Finds a word the player reads on screen (OCR), e.g. "CONTINUAR". */
export class OcrTextTarget implements ScreenTarget {
  constructor(
    readonly name: string,
    private readonly ocr: Ocr,
    private readonly lang: string,
    private readonly text: RegExp,
  ) {}

  async locate(frame: Buffer): Promise<TargetMatch | null> {
    const read = await this.ocr.read(frame, this.lang, { scale: 1.5 });
    const word = read.words.find((w) => this.text.test(normalize(w.text)));
    if (!word) return null;
    const size = await imageSize(frame);
    return {
      x: (word.box.x + word.box.w / 2) / size.width,
      y: (word.box.y + word.box.h / 2) / size.height,
      score: word.confidence / 100,
      detail: `${this.name} read on screen: "${word.text}"`,
    };
  }
}

/** Last resort: a calibrated position. Always "found" — callers must verify the reaction on screen. */
export class FixedPointTarget implements ScreenTarget {
  constructor(
    readonly name: string,
    private readonly point: { x: number; y: number },
  ) {}

  async locate(): Promise<TargetMatch> {
    return { ...this.point, score: 0, detail: `${this.name} at calibrated position (${this.point.x}, ${this.point.y})` };
  }
}

/** Composite: the first target that is visible, in order of preference. */
export class FirstVisibleTarget implements ScreenTarget {
  constructor(
    readonly name: string,
    private readonly targets: ScreenTarget[],
  ) {}

  async locate(frame: Buffer): Promise<TargetMatch | null> {
    for (const t of this.targets) {
      const m = await t.locate(frame);
      if (m) return m;
    }
    return null;
  }
}
