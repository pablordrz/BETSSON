import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import { moneyEq } from '../utils/money';
import { sleep } from '../utils/text';
import type { ScreenTarget } from './controls/screen-target';
import { cropRel, type GameScreen } from './game-screen';
import { readHud, type HudReading } from './hud';
import { diffRatio } from './motion';
import type { Ocr } from './ocr';

export interface SettleResult {
  settled: boolean;
  elapsedMs: number;
  /** HUD read once the spin settled (or the last one read). */
  hud: HudReading;
  /** Which signals were seen at the end (for the report). */
  detail: string;
}

/**
 * "The spin is over" as a player sees it — three signals together, polled fast:
 *  1. the spin button is available again (fast re-check where it was found),
 *  2. the reels are calm (frame-to-frame change at or below the measured idle noise, twice),
 *  3. CREDIT stopped changing (two equal reads: win counters animate up).
 * Much faster than waiting for N perfectly identical frames, which animated backgrounds rarely give.
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
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 200;
  let prevReels: Buffer | undefined;
  let calm = 0;
  let prevCredit: number | undefined;
  let hud: HudReading | undefined;
  let detail = '';
  while (Date.now() - start < timeoutMs) {
    const frame = await game.capture();
    const reels = (await cropRel(frame, layout.reels)).png;
    const diff = prevReels ? await diffRatio(prevReels, reels) : 1;
    prevReels = reels;
    calm = diff <= opts.calmThreshold ? calm + 1 : 0;
    if (calm >= 2 && (await spinButton.locate(frame))) {
      hud = await readHud(game, ocr, market, layout, frame);
      const credit = hud.credit?.value?.amount;
      detail = `button available, reels calm (${(diff * 100).toFixed(1)}%), CREDIT ${credit?.toFixed(2) ?? '?'}`;
      if (credit !== undefined && prevCredit !== undefined && moneyEq(credit, prevCredit, 0)) {
        return { settled: true, elapsedMs: Date.now() - start, hud, detail };
      }
      prevCredit = credit;
    }
    await sleep(intervalMs);
  }
  return {
    settled: false,
    elapsedMs: Date.now() - start,
    hud: hud ?? (await readHud(game, ocr, market, layout)),
    detail: detail || 'never calm with the button available',
  };
}
