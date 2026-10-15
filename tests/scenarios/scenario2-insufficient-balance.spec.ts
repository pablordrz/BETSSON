import { fmt, moneyEq } from '../../src/utils/money';
import { pct, sleep } from '../../src/utils/text';
import { annotate } from '../../src/vision/annotate';
import { isBlank } from '../../src/vision/game-screen';
import { findMessage, readHudSettled, waitForPlayableHud } from '../../src/vision/hud';
import { measureIdleNoise, waitForMotion } from '../../src/vision/motion';
import { triggerSpin } from '../../src/vision/spin';
import { expect, test } from '../fixtures';

test.use({ account: 'empty' });

test('Scenario 2 — insufficient balance', async ({ site, wallet, ocr, market, layout, checks }) => {
  const cur = market.currency;
  const insufficient = (gt: typeof market.gameText) => gt.insufficientBalance;

  const { game, provider } = await test.step(`Launch "${market.gameSlug}" from the Pragmatic Play page in Real Play`, () => site.launchGame(layout));
  await checks.check('game.provider', 'Game is a Pragmatic Play game listed on the provider page', provider.listedOnProviderPage && /pragmatic/i.test(provider.gameDetailId ?? ''), `listed on ${market.providerPath}, game detail id "pragmaticPlay…"`, `listed: ${provider.listedOnProviderPage ? `yes ("${provider.tileTitle}")` : 'no'} · detail id: ${provider.gameDetailId ?? 'not found'}`);
  const hudBefore = await test.step('Wait until the game is playable (HUD readable)', () => waitForPlayableHud(game, ocr, market, layout));
  const blank = await isBlank(hudBefore.frame);
  await checks.check('game.rendered', 'Game is visibly rendered (canvas not blank)', !blank.blank, 'rendered game', `stdev ${blank.stdev.toFixed(1)}`);

  // 4. Balances before the attempt
  const betssonBefore = await test.step('Read Betsson balance before the attempt', () => wallet.read());
  await checks.image('betsson-balance-before', betssonBefore.screenshot);
  const evBefore = await checks.image('game-before-attempt (OCR regions)', await annotate(hudBefore.frame, hudBefore.marks, `BEFORE · ${market.site}`));
  const credit0 = hudBefore.credit?.value;
  const bet = hudBefore.bet?.value;
  await checks.check('game.currency', `Game shows ${cur}`, credit0?.currency === cur, cur, `CREDIT ${fmt(credit0)} · BET ${fmt(bet)}`, { evidence: [evBefore] });
  await checks.check('betsson.currency', `Betsson balance is in ${cur}`, betssonBefore.money.currency === cur, cur, fmt(betssonBefore.money), { evidence: ['betsson-balance-before'] });
  await checks.info('precondition', 'Account has no usable balance for the wager', `balance < wager`, `Betsson ${fmt(betssonBefore.money)} · CREDIT ${fmt(credit0)} · BET ${fmt(bet)}`);
  expect(credit0, 'Cannot continue without reading CREDIT from the game').toBeTruthy();

  // 5. Attempt a spin; 6. look for the visible rejection
  const reels = async () => (await game.captureRegion(layout.reels)).png;
  const noise = await measureIdleNoise(reels);
  let message = await findMessage(game, ocr, market, insufficient); // some games show it immediately on load
  let reelMotion = 0;
  const attempts = await test.step('Attempt a spin and look for the insufficient-balance message', () =>
    triggerSpin(game, market, layout, async () => {
      const m = await waitForMotion(reels, { threshold: Math.max(0.04, noise * 3), timeoutMs: 2500 });
      reelMotion = Math.max(reelMotion, m.peak);
      for (let i = 0; i < 4; i++) {
        message = await findMessage(game, ocr, market, insufficient);
        if (message.found) return { done: true, detail: `message shown (${message.source}): "${message.text}"` };
        await sleep(1000);
      }
      return { done: false, detail: `no message visible (screen change ${pct(m.peak)})` };
    }),
  );
  await checks.json('spin-attempts', attempts);
  const evMsg = await checks.image('insufficient-balance-message', await annotate(message.frame, message.box ? [{ box: message.box, label: 'message', color: '#ff1744' }] : [], `ATTEMPT · ${market.site}`));

  await checks.check('message.shown', 'Player sees an insufficient-balance message', message.found, 'insufficient-balance message visible', message.found ? `"${message.text}" (${message.source === 'game' ? 'inside the game canvas' : 'Betsson UI'})` : `none · OCR: ${message.text.slice(0, 160)}`, { evidence: [evMsg] });
  await checks.check('message.language', `Message is in ${market.language}`, message.found && message.expectedLanguage, market.language, message.found ? (message.expectedLanguage ? market.language : 'another language') : 'no message', { evidence: [evMsg] });

  // Balances after
  const hudAfter = await test.step('Read the game balance after the attempt', () => readHudSettled(game, ocr, market, layout));
  const evAfter = await checks.image('game-after-attempt (OCR regions)', await annotate(hudAfter.frame, hudAfter.marks, `AFTER · ${market.site}`));
  const credit1 = hudAfter.credit?.value;
  const creditUnchanged = !!credit1 && moneyEq(credit1.amount, credit0!.amount);
  await checks.check('game.balance.unchanged', 'In-game balance did not change', creditUnchanged, fmt(credit0), fmt(credit1), { evidence: [evBefore, evAfter] });

  await sleep(5000); // give the wallet time to (wrongly) move, then verify it did not
  const betssonAfter = await test.step('Read Betsson balance after the attempt', () => wallet.read());
  await checks.image('betsson-balance-after', betssonAfter.screenshot);
  const betssonUnchanged = moneyEq(betssonAfter.money.amount, betssonBefore.money.amount);
  await checks.check('betsson.balance.unchanged', 'Betsson balance did not change', betssonUnchanged, fmt(betssonBefore.money), fmt(betssonAfter.money), { evidence: ['betsson-balance-before', 'betsson-balance-after'] });

  await checks.check('spin.rejected', 'Attempted spin was rejected, not completed as a paid spin', message.found && creditUnchanged && betssonUnchanged && !hudAfter.win?.value?.amount, 'message shown, no debit, no payout', `message ${message.found ? 'yes' : 'no'} · credit ${creditUnchanged ? 'unchanged' : 'CHANGED'} · Betsson ${betssonUnchanged ? 'unchanged' : 'CHANGED'} · max screen change ${pct(reelMotion)}`, { evidence: [evMsg, evAfter] });
});
