import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import { moneyEq, type Money } from '../utils/money';
import { sleep } from '../utils/text';
import type { ScreenTarget } from './controls/screen-target';
import type { GameScreen } from './game-screen';
import { readHud } from './hud';
import type { Ocr } from './ocr';

export interface BetAdjustment {
  from: Money | null;
  to: Money | null;
  presses: number;
  detail: string;
  /** Frame where the button was looked for, when it was not found (evidence). */
  frame?: Buffer;
}

/**
 * Lowers the wager to the game's minimum like a player: press "−" (found by image) and READ the new BET on
 * screen after each press; stop when the BET no longer goes down. The screen, not the click count, decides.
 */
export async function lowerBetToMinimum(
  game: GameScreen,
  ocr: Ocr,
  market: MarketConfig,
  layout: GameLayout,
  betDown: ScreenTarget,
  maxPresses = 20,
): Promise<BetAdjustment> {
  const from = (await readHud(game, ocr, market, layout)).bet?.value ?? null;
  let current = from;
  let presses = 0;
  let unchanged = 0;
  while (presses < maxPresses && unchanged < 2) {
    const frame = await game.capture();
    const button = await betDown.locate(frame);
    if (!button) {
      const best = (betDown as { lastBest?: { score: number; x: number; y: number } }).lastBest;
      const why = best ? ` (best candidate score ${best.score.toFixed(2)} at ${best.x.toFixed(2)}, ${best.y.toFixed(2)})` : '';
      return { from, to: current, presses, detail: `${betDown.name} not visible${why}`, frame };
    }
    await game.clickRel(button.x, button.y);
    presses++;
    await sleep(250);
    const next = (await readHud(game, ocr, market, layout)).bet?.value ?? null;
    // two presses in a row without a lower BET on screen = minimum reached (one may be a misread)
    if (next && current && next.amount < current.amount && !moneyEq(next.amount, current.amount, 0)) {
      current = next;
      unchanged = 0;
    } else unchanged++;
  }
  return { from, to: current, presses, detail: `BET ${from?.amount.toFixed(2) ?? '?'} → ${current?.amount.toFixed(2) ?? '?'} after ${presses} presses` };
}

/**
 * Fast wager change: find the button once and press it `times` in a row (no reading in between).
 * Pressing "−" past the minimum does nothing, so it is safe to over-press.
 */
export async function pressRepeatedly(game: GameScreen, button: ScreenTarget, times: number, gapMs = 120): Promise<boolean> {
  const where = await button.locate(await game.capture());
  if (!where) return false;
  for (let i = 0; i < times; i++) {
    await game.clickRel(where.x, where.y);
    await sleep(gapMs);
  }
  return true;
}
