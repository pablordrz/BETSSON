/**
 * Atomic steps — the building blocks of every journey.
 *
 * Contract: a step DETECTS where it is, ACTS like a player, and VALIDATES on screen that it worked.
 * It receives explicit input, returns explicit output, and never knows about other steps. That lets each team
 * member own, test and optimise one step (template matching, Hough, YOLO, a vision-language model, …) without
 * touching the others, and lets any journey be written as a plain sequence of steps.
 */
import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import type { BetssonSite } from '../pages/betsson-site';
import type { BetssonWallet } from '../pages/betsson-wallet';
import type { GameControls } from '../vision/controls/game-controls';
import type { Ocr } from '../vision/ocr';

/** Shared services a step may use (never mutable journey state: that travels as input/output). */
export interface StepContext {
  site: BetssonSite;
  wallet: BetssonWallet;
  ocr: Ocr;
  market: MarketConfig;
  layout: GameLayout;
  controls: GameControls;
  /** Structured log of the running step: what it saw on screen, what it decided. */
  log: (message: string, data?: Record<string, unknown>) => void;
}

/** What a step returns. `ok` is the step's own on-screen validation, not "the code did not throw". */
export interface StepOutcome<O> {
  ok: boolean;
  /** One line for the report: what was validated and what was observed. */
  detail: string;
  /** Output for the next steps (present even when !ok if something useful was read). */
  data?: O;
  /** Screenshots supporting the result (attached to the report). */
  evidence?: Array<{ name: string; png: Buffer }>;
}

export interface Step<I, O> {
  /** Stable id, e.g. "game.enter". Used in logs and in the report. */
  readonly id: string;
  /** What the step proves, in player terms. */
  readonly title: string;
  /** Safe to retry automatically (reads, navigation). NEVER true for anything that may spend money. */
  readonly retryable?: boolean;
  run(ctx: StepContext, input: I): Promise<StepOutcome<O>>;
}

/** Helper to declare a step with type inference. */
export const defineStep = <I, O>(step: Step<I, O>): Step<I, O> => step;
