/**
 * Raise the wager with "+" and spin once at the raised wager:   npm run bet:raise     (⚠ one real spin)
 *   BET_STEPS=1 (presses of "+", default 1) · MAX_BET=0.50 (cap in €, the wager never goes above it)
 * Proves on screen: BET goes up one step at a time, the raised BET is the one charged by the spin, and the in-game
 * and Betsson balances reconcile. At the end the wager is put back to the minimum.
 */
import {
  attachGame,
  checkLoggedIn,
  enterGame,
  goToGame,
  measureIdle,
  preflight,
  raiseBet,
  readBetssonBalance,
  readGameHud,
  reconcileBetsson,
  reconcileGame,
  setMinimumBet,
  spin,
  startGameSession,
  waitSpinEnd,
  wagerUsed,
} from '../../src/steps';
import { test } from '../fixtures';

test.use({ account: 'funded' });

const BET_STEPS = Number(process.env.BET_STEPS ?? 1);
const MAX_BET = Number(process.env.MAX_BET ?? 0.5);

test(`Raise the wager with "+" (${BET_STEPS} step(s), cap ${MAX_BET.toFixed(2)} €) and spin once`, async ({ steps }) => {
  await steps.must(checkLoggedIn);
  await steps.must(goToGame);
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  await steps.must(enterGame, { game });

  // from the minimum, raise one step at a time (read on screen after each press)
  await steps.must(setMinimumBet, { game });
  await steps.must(raiseBet, { game, presses: BET_STEPS, maxBet: MAX_BET });

  // spin once at the raised wager — only if it is safe
  const betssonBefore = (await steps.must(readBetssonBalance)).data.balance;
  const before = (await steps.must(readGameHud, { game })).data;
  await steps.must(preflight, { credit: before.credit, bet: before.bet, betsson: betssonBefore });
  const { noise } = (await steps.must(measureIdle, { game })).data;
  await steps.must(spin, { game, credit: before.credit, noise });
  const after = (await steps.must(waitSpinEnd, { game, noise })).data;

  // the raised wager is the one charged; balances reconcile
  await steps.run(wagerUsed, { betBefore: before.bet, betAfter: after.hud.bet?.value ?? null, before: before.credit, after: after.credit, win: after.win });
  await steps.run(reconcileGame, { before: before.credit, bet: before.bet, after: after.credit, win: after.win });
  await steps.run(reconcileBetsson, { start: betssonBefore, wagered: before.bet.amount, paid: after.win?.amount ?? 0 });

  // leave the game at the minimum wager for the next run
  await steps.run(setMinimumBet, { game });
});
