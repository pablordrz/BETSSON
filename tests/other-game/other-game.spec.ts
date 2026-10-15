/**
 * ANOTHER Pragmatic Play game — does the checker generalise beyond Triple Hop Pots?
 *   npm run game:other                       (default OTHER_GAME=helios-triple-sun: same "Triple" family as Triple Hop Pots)   ⚠ at most ONE real spin
 *   OTHER_GAME=<slug> MAX_BET=0.50 npm run game:other
 *
 * Same atomic steps as scenario 1, nothing specific to Triple Hop Pots: the game is opened by its slug, the controls
 * are found by image (Pragmatic templates → circle Hough → SPACE), the HUD is read by OCR. The report records WHICH
 * detector found each control, so a different look shows up clearly. If something is not safe (HUD not read,
 * wager above MAX_BET, balance too low) the journey stops BEFORE spinning, with the reason in the report.
 */
import {
  attachGame,
  checkLoggedIn,
  closePanels,
  enterGame,
  exitGameBalanceMatches,
  measureIdle,
  openGameBySlug,
  preflight,
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

const SLUG = process.env.OTHER_GAME?.trim() || 'helios-triple-sun';
const MAX_BET = Number(process.env.MAX_BET ?? 0.5);

test(`Another Pragmatic Play game: "${SLUG}" — open, read the HUD, one spin at the minimum wager`, async ({ steps, checks }) => {
  // 1. The requested game, in Real Play
  await steps.must(checkLoggedIn);
  await steps.must(openGameBySlug, { slug: SLUG });
  await steps.must(startGameSession);
  const { game } = (await steps.must(attachGame)).data;
  const entered = await steps.must(enterGame, { game });
  await steps.must(closePanels, { game }); // e.g. a bet panel left open: it would hide the reels and the HUD
  await checks.info('other.intro', `How the intro of "${SLUG}" was passed`, 'continue button recognised (icon / text / Hough) or already playable', entered.detail);

  // 2. Smallest wager, then what the player sees before spinning
  const lowered = await steps.run(setMinimumBet, { game });
  await steps.must(closePanels, { game }); // pressing next to the spin button can open the bet panel (Helios Triple Sun)
  const betsson = (await steps.must(readBetssonBalance)).data.balance;
  const before = (await steps.must(readGameHud, { game })).data;
  await checks.info('other.wager', `Wager on "${SLUG}"`, `minimum wager, at most ${MAX_BET.toFixed(2)} €`, `${lowered.detail} · BET read ${before.bet.amount.toFixed(2)} ${before.bet.currency}`);

  // 3. Never spin above the cap (another game may have a higher minimum wager)
  const affordable = before.bet.amount <= MAX_BET;
  await checks.check(
    'other.cap',
    `Wager within the cap before spinning on "${SLUG}"`,
    affordable,
    `BET ≤ ${MAX_BET.toFixed(2)} €`,
    `BET ${before.bet.amount.toFixed(2)} €${affordable ? '' : ' — NOT spinning'}`,
  );
  if (!affordable) return;
  await steps.must(preflight, { credit: before.credit, bet: before.bet, betsson });

  // 4. One spin, proven on screen; record which detector found the spin button on this game
  const { noise } = (await steps.must(measureIdle, { game })).data;
  const started = await steps.must(spin, { game, credit: before.credit, noise });
  await checks.info('other.spinButton', `How the spin button of "${SLUG}" was found`, 'template (Pragmatic icon) → Hough → SPACE → calibrated position', started.detail);
  const after = (await steps.must(waitSpinEnd, { game, noise })).data;

  // 5. Money rules, exactly as in scenario 1
  await steps.run(wagerUsed, { betBefore: before.bet, betAfter: after.hud.bet?.value ?? null, before: before.credit, after: after.credit, win: after.win });
  await steps.run(reconcileGame, { before: before.credit, bet: before.bet, after: after.credit, win: after.win });
  await steps.run(reconcileBetsson, { start: betsson, wagered: before.bet.amount, paid: after.win?.amount ?? 0 });
  await steps.run(exitGameBalanceMatches, { credit: after.credit });
});
