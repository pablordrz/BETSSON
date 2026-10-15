/**
 * DEMO — fast continuous spins, no verification or report (the validated journeys are the scenarios):
 *   npm run demo            (SPINS=10)
 * Login → game → minimum wager (burst) → spin, wait until the spin is over, print CREDIT, repeat.
 * Waiting for the end of each spin is pacing, not a check: pressing during a spin would only stop the reels.
 */
import { pressRepeatedly } from '../../src/vision/bet';
import { readHud, waitForPlayableHud } from '../../src/vision/hud';
import { measureIdleNoise } from '../../src/vision/motion';
import { waitForSpinSettled } from '../../src/vision/settle';
import { test } from '../fixtures';

test.use({ account: 'funded' });

const SPINS = Number(process.env.SPINS ?? 10);

test(`Demo — ${SPINS} quick spins`, async ({ site, ocr, market, layout, controls }) => {
  test.setTimeout((2 + SPINS * 0.5) * 60_000);
  const log = (line: string) => console.log(`[demo ${new Date().toLocaleTimeString()}] ${line}`);
  const t0 = Date.now();

  const { game } = await site.openGame(layout);
  const hud = await waitForPlayableHud(game, ocr, market, layout, controls.continueButton);
  log(`game ready in ${((Date.now() - t0) / 1000).toFixed(0)}s · CREDIT ${hud.credit?.value?.amount.toFixed(2)} · BET ${hud.bet?.value?.amount.toFixed(2)}`);

  await pressRepeatedly(game, controls.betDown, 10);
  let state = await readHud(game, ocr, market, layout);
  const bet = state.bet?.value?.amount ?? 0;
  log(`minimum wager: ${bet.toFixed(2)} ${market.currency}`);

  const noise = await measureIdleNoise(async () => (await game.captureRegion(layout.reels)).png, 800, 200);
  for (let i = 1; i <= SPINS; i++) {
    const before = state.credit?.value?.amount;
    if (before !== undefined && before < bet) {
      log(`stop: CREDIT ${before.toFixed(2)} < BET ${bet.toFixed(2)}`);
      break;
    }
    const s0 = Date.now();
    await controls.spin[0].perform(game); // click the spin button found by image
    const settled = await waitForSpinSettled(game, ocr, market, layout, controls.spinButton, { calmThreshold: Math.max(0.01, noise * 1.5), timeoutMs: 20_000 });
    state = settled.hud;
    const after = state.credit?.value?.amount;
    const win = state.win?.value?.amount ?? 0;
    log(`spin ${i}: ${before?.toFixed(2) ?? '?'} → ${after?.toFixed(2) ?? '?'} ${market.currency}${win ? `  WIN ${win.toFixed(2)}` : ''}  (${((Date.now() - s0) / 1000).toFixed(1)}s)`);
  }
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
});
