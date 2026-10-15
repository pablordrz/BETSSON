/**
 * Scenario 2 — insufficient balance. Same atomic steps as scenario 1, with the expectations reversed:
 * the spin is rejected, the player sees the message in the market language, and no balance moves.
 */
import {
  attachGame,
  attemptRejectedSpin,
  balanceUnchanged,
  checkLoggedIn,
  enterGame,
  findGameMessage,
  goToGame,
  measureIdle,
  readBetssonBalance,
  readGameHud,
  startGameSession,
} from '../../src/steps';
import { sleep } from '../../src/utils/text';
import { test } from '../fixtures';

test.use({ account: 'empty' });

test('Scenario 2 — insufficient balance', async ({ steps }) => {
  await steps.must(checkLoggedIn);
  await steps.must(goToGame);
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  await steps.must(enterGame, { game });

  // 4. Balances before the attempt
  const betssonBefore = (await steps.must(readBetssonBalance)).data.balance;
  const before = (await steps.must(readGameHud, { game })).data;
  // In Brave (CDP) the logged-in account is whatever the browser has: with money, pressing spin is a real wager.
  test.skip(
    before.credit.amount >= before.bet.amount,
    `Account has balance (CREDIT ${before.credit.amount.toFixed(2)} ≥ BET ${before.bet.amount.toFixed(2)}): scenario 2 needs an account without money — not spinning`,
  );

  // 5–6. Attempt a spin: rejected, with a visible message in the expected language
  const { noise } = (await steps.must(measureIdle, { game })).data;
  await steps.run(attemptRejectedSpin, { game, noise });
  await steps.run(findGameMessage, { game, kind: 'insufficientBalance' });

  // Balances afterwards: unchanged in the game and in Betsson
  const after = await steps.run(readGameHud, { game });
  await steps.run(balanceUnchanged, { what: 'in-game CREDIT', before: before.credit, after: after.data?.credit ?? null });
  await sleep(5000); // give the wallet time to (wrongly) move, then verify it did not
  const betssonAfter = await steps.run(readBetssonBalance);
  await steps.run(balanceUnchanged, { what: 'Betsson balance', before: betssonBefore, after: betssonAfter.data?.balance ?? null });
});
