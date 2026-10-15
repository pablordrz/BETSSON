/**
 * Series of Real Play spins at the minimum wager, to watch the balance evolve:  npm run spins  (SPINS=10)
 * Built from the same atomic steps as the scenarios; at the end the game is left and Betsson's balance on the page must equal the last in-game CREDIT.
 */
import { balanceChart, type BalancePoint } from '../../src/reporter/balance-chart';
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

const SPINS = Number(process.env.SPINS ?? 10);

test(`Spin series — ${SPINS} spins at the minimum wager`, async ({ steps, checks, market }) => {
  test.setTimeout((3 + SPINS * 0.75) * 60_000);

  await steps.must(checkLoggedIn);
  await steps.must(goToGame);
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  await steps.must(enterGame, { game });
  await steps.run(setMinimumBet, { game });

  const betssonStart = (await steps.must(readBetssonBalance)).data.balance;
  const start = (await steps.must(readGameHud, { game })).data;
  const { noise } = (await steps.must(measureIdle, { game })).data;

  const bet = start.bet;
  // Optional spending cap: never spin when the wager read is above MAX_BET (e.g. the minimum could not be set)
  const maxBet = Number(process.env.MAX_BET ?? Infinity);
  test.skip(bet.amount > maxBet, `BET ${bet.amount.toFixed(2)} is above MAX_BET ${maxBet.toFixed(2)}: not spinning`);
  let credit = start.credit;
  const points: BalancePoint[] = [{ label: 'start', balance: credit.amount }];

  for (let i = 1; i <= SPINS; i++) {
    const safe = await steps.run(preflight, { credit, bet, betsson: { ...betssonStart, amount: credit.amount } });
    if (!safe.ok) break;
    const started = await steps.run(spin, { game, credit, noise });
    if (!started.ok) break;
    const end = await steps.run(waitSpinEnd, { game, noise });
    if (!end.data) break; // cannot continue without knowing the balance
    credit = end.data.credit;
    points.push({ label: `#${i}`, balance: credit.amount });
  }

  await checks.image('balance-evolution', await balanceChart(points, `In-game balance · ${points.length - 1} spins · ${market.site}`, market.currency));
  await checks.json('balance-evolution', points);
  await steps.run(exitGameBalanceMatches, { credit });
});
