/**
 * Scenario 1 — completed Real Play spin. A plain sequence of atomic steps (src/steps): each one detects, acts
 * like a player, validates on screen, logs what it read and adds a PASS/FAIL row with evidence.
 * `must` = the journey cannot continue without it; `run` = soft (recorded, the journey goes on).
 */
import {
  attachGame,
  checkLoggedIn,
  enterGame,
  exitGameBalanceMatches,
  goToGame,
  measureIdle,
  preflight,
  readBetssonBalance,
  readGameHud,
  setMinimumBet,
  spin,
  startGameSession,
  waitSpinEnd,
} from '../../src/steps';
import { test } from '../fixtures';

test.use({ account: 'funded' });

test('Scenario 1 — completed Real Play spin', async ({ steps }) => {
  // 1–3. Lobby (session injected by the fixtures), Pragmatic Play game, Real Play
  await steps.must(checkLoggedIn);
  await steps.must(goToGame);
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  await steps.must(enterGame, { game });
  if (process.env.MIN_BET !== '0') await steps.run(setMinimumBet, { game });

  // 4. Balances, wager and currency before the spin — and only spin if it is safe
  const betssonBefore = (await steps.must(readBetssonBalance)).data.balance;
  const before = (await steps.must(readGameHud, { game })).data;
  await steps.must(preflight, { credit: before.credit, bet: before.bet, betsson: betssonBefore });

  // 5–6. Spin like a player; proof = the screen reacts and settles
  const { noise } = (await steps.must(measureIdle, { game })).data;
  await steps.must(spin, { game, credit: before.credit, noise });
  const after = (await steps.must(waitSpinEnd, { game, noise })).data;

  // 7. Leave the game: Betsson's balance on the page must equal the last CREDIT read in the game
  await steps.run(exitGameBalanceMatches, { credit: after.credit });
});
