import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import { moneyEq } from '../utils/money';
import { sleep } from '../utils/text';
import type { ScreenTarget } from './controls/screen-target';
import { cropRel, type GameScreen } from './game-screen';
import { readHud, type HudReading } from './hud';
import { diffRatio } from './motion';
import type { Ocr } from './ocr';

/** CREDIT reads in a row that must agree to end a spin whose win animation keeps the screen moving. */
const CELEBRATION_STABLE_READS = 4;
/** A spin never ends sooner than this (the button can look available while the reels start). */
const MIN_SPIN_MS = 3000;

export interface SettleResult {
  settled: boolean;
  elapsedMs: number;
  /** HUD read once the spin settled (or the last one read). */
  hud: HudReading;
  /** Which signals were seen at the end (for the report). */
  detail: string;
}

/**
 * "The spin is over" as a player sees it, polled fast. Settled when:
 *  - the reels are calm (frame-to-frame change at or below the measured idle noise, twice in a row), CREDIT
 *    stopped changing, and the spin button is available again (or CREDIT stayed the same one more read when the
 *    button cannot be recognised on this game's artwork); or
 *  - a win animation (coins, glow) keeps the reels area moving, but CREDIT has not changed for several reads and
 *    the spin button is back.
 */
export async function waitForSpinSettled(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  spinButton: ScreenTarget,
  opts: { calmThreshold: number; timeoutMs?: number; intervalMs?: number },
): Promise<SettleResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 150;
  let prevReels: Buffer | undefined;
  let calm = 0;
  let sameCredit = 0;
  let prevCredit: number | undefined;
  let hud: HudReading | undefined;
  let detail = '';
  while (Date.now() - start < timeoutMs) {
    const frame = await game.capture();
    const reels = (await cropRel(frame, layout.reels)).png;
    const diff = prevReels ? await diffRatio(prevReels, reels) : 1;
    prevReels = reels;
    calm = diff <= opts.calmThreshold ? calm + 1 : 0;

    hud = await readHud(game, ocr, market, layout, frame);
    const credit = hud.credit?.value?.amount;
    sameCredit = credit !== undefined && prevCredit !== undefined && moneyEq(credit, prevCredit, 0) ? sameCredit + 1 : 0;
    prevCredit = credit;

    if (calm >= 2 && sameCredit >= 1) {
      const button = await spinButton.locate(frame);
      detail = `reels calm (${(diff * 100).toFixed(1)}%), CREDIT ${credit?.toFixed(2)} stable, spin button ${button ? 'available' : 'not recognised'}`;
      if (button || sameCredit >= 2) return { settled: true, elapsedMs: Date.now() - start, hud, detail };
    } else if (sameCredit >= CELEBRATION_STABLE_READS && Date.now() - start >= MIN_SPIN_MS && (await spinButton.locate(frame))) {
      detail = `animation still playing (reels change ${(diff * 100).toFixed(1)}%), CREDIT ${credit?.toFixed(2)} stable for ${sameCredit + 1} reads, spin button available`;
      return { settled: true, elapsedMs: Date.now() - start, hud, detail };
    }
    await sleep(intervalMs);
  }
  return {
    settled: false,
    elapsedMs: Date.now() - start,
    hud: hud ?? (await readHud(game, ocr, market, layout)),
    detail: detail || `never settled with a stable CREDIT (last reels change above ${(opts.calmThreshold * 100).toFixed(1)}%)`,
  };
}
