/**
 * REPORT DEMO — a test that FAILS ON PURPOSE, to show what the report looks like when something goes wrong:
 *   npm run report:demo        (⚠ one real spin at the minimum wager)
 * The journey is real (login, game, one spin). After the spin, the CREDIT read on screen is deliberately
 * altered by −1 € (fault injection, declared in the report as an INFO row). With that "misread", the in-game
 * balance rule and the comparison with Betsson's balance on the page (DOM) fail, with screenshot, expected vs
 * observed, the why and the step's log lines. NOT part of `npm test` / `npm run all`.
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
  reconcileGame,
  setMinimumBet,
  spin,
  startGameSession,
  waitSpinEnd,
} from '../../src/steps';
import { fmt, round2 } from '../../src/utils/money';
import { test } from '../fixtures';

test.use({ account: 'funded' });

/** The injected misread: the checker "reads" 1 € less than the screen shows. */
const INJECTED_ERROR_EUR = -1;

test('DEMO informe — fallo provocado: el CRÉDITO leído tras la tirada tiene 1 € de menos', async ({ steps, checks }) => {
  await steps.must(checkLoggedIn);
  await steps.must(goToGame);
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  await steps.must(enterGame, { game });
  await steps.run(setMinimumBet, { game });

  const betssonBefore = (await steps.must(readBetssonBalance)).data.balance;
  const before = (await steps.must(readGameHud, { game })).data;
  await steps.must(preflight, { credit: before.credit, bet: before.bet, betsson: betssonBefore });
  const { noise } = (await steps.must(measureIdle, { game })).data;
  await steps.must(spin, { game, credit: before.credit, noise });
  const after = (await steps.must(waitSpinEnd, { game, noise })).data;

  // ── FAULT INJECTION (on purpose, for the demo) ──────────────────────────────────────────────────────────────
  const misread = { ...after.credit, amount: round2(after.credit.amount + INJECTED_ERROR_EUR), raw: `${after.credit.raw} (−1 € inyectado)` };
  await checks.info(
    'demo.faultInjection',
    'FALLO PROVOCADO A PROPÓSITO: el CRÉDITO leído se altera para enseñar cómo es el informe',
    `CRÉDITO leído en pantalla: ${fmt(after.credit)}`,
    `CRÉDITO usado a partir de aquí: ${fmt(misread)} (${INJECTED_ERROR_EUR} €)`,
    { note: 'Este test no forma parte de los escenarios: existe solo para mostrar un fallo en el informe.' },
  );

  // These two checks now FAIL, as they would if the OCR had really misread the balance:
  await steps.run(reconcileGame, { before: before.credit, bet: before.bet, after: misread, win: after.win }); // in-game rule
  await steps.run(exitGameBalanceMatches, { credit: misread }); // vs Betsson's balance on the page (DOM)
});
