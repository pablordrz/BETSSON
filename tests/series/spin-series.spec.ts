/**
 * Series of Real Play spins at the minimum wager, to watch the balance evolve:  npm run spins  (SPINS=10)
 * Built from the same atomic steps as the scenarios; Betsson's balance is reconciled once at the end.
 */
import { balanceChart, type BalancePoint } from '../../src/reporter/balance-chart';
import {
  attachGame,
  checkLoggedIn,
  enterGame,
  goToGame,
  measureIdle,
  preflight,
  readBetssonBalance,
  readGameHud,
  reconcileBetsson,
  reconcileGame,
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
  let credit = start.credit;
  let wagered = 0;
  let paid = 0;
  const points: BalancePoint[] = [{ label: 'start', balance: credit.amount }];

  for (let i = 1; i <= SPINS; i++) {
    const safe = await steps.run(preflight, { credit, bet, betsson: { ...betssonStart, amount: betssonStart.amount - wagered + paid } });
    if (!safe.ok) break;
    const started = await steps.run(spin, { game, credit, noise });
    if (!started.ok) break;
    wagered += bet.amount;
    const end = await steps.run(waitSpinEnd, { game, noise });
    if (!end.data) break; // cannot continue without knowing the balance
    await steps.run(reconcileGame, { before: credit, bet, after: end.data.credit, win: end.data.win });
    paid += end.data.win?.amount ?? 0;
    credit = end.data.credit;
    points.push({ label: `#${i}`, balance: credit.amount, payout: end.data.win?.amount || undefined });
  }

  await checks.image('balance-evolution', await balanceChart(points, `In-game balance · ${points.length - 1} spins · ${market.site}`, market.currency));
  await checks.json('balance-evolution', points);
  await steps.run(reconcileBetsson, { start: betssonStart, wagered, paid });
});
