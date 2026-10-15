import { fmt, moneyEq, round2 } from '../../src/utils/money';
import { normalize, pct } from '../../src/utils/text';
import { annotate } from '../../src/vision/annotate';
import { isBlank } from '../../src/vision/game-screen';
import { readHud, readHudSettled, waitForPlayableHud } from '../../src/vision/hud';
import { measureIdleNoise, waitForMotion, waitForStable } from '../../src/vision/motion';
import { triggerSpin } from '../../src/vision/spin';
import { expect, test } from '../fixtures';

test.use({ account: 'funded' });

test('Scenario 1 — completed Real Play spin', async ({ site, wallet, ocr, market, layout, checks, providerTap }) => {
  const cur = market.currency;

  // 1–3. Pragmatic Play provider page (already authenticated) → launch the game in Real Play
  const { game, provider } = await test.step(`Open "${site.openGameSlug() ?? market.gameSlug}" in Real Play (Pragmatic Play)`, () => site.openGame(layout));
  await checks.check('game.provider', 'Game is a Pragmatic Play game listed on the provider page', provider.listedOnProviderPage && /pragmatic/i.test(provider.gameDetailId ?? ''), `listed on ${market.providerPath}, game detail id "pragmaticPlay…"`, `listed: ${provider.listedOnProviderPage ? `yes ("${provider.tileTitle}")` : 'no'} · detail id: ${provider.gameDetailId ?? 'not found'}`);
  const hudBefore = await test.step('Wait until the game is playable (HUD readable)', () => waitForPlayableHud(game, ocr, market, layout));

  const blank = await isBlank(hudBefore.frame);
  await checks.check('game.rendered', 'Game is visibly rendered (canvas not blank)', !blank.blank, 'rendered game', blank.blank ? `blank canvas (stdev ${blank.stdev.toFixed(1)})` : `rendered (stdev ${blank.stdev.toFixed(1)})`);

  // 4. Betsson balance before; displayed wager and currency
  const betssonBefore = await test.step('Read Betsson balance before the spin', () => wallet.read());
  await checks.image('betsson-balance-before', betssonBefore.screenshot);
  const evBefore = await checks.image('game-before-spin (OCR regions)', await annotate(hudBefore.frame, hudBefore.marks, `BEFORE · ${market.site}`));

  const credit0 = hudBefore.credit?.value;
  const bet = hudBefore.bet?.value;
  await checks.check('wager.displayed', 'Wager is displayed in the game', !!bet, `a wager in ${cur}`, fmt(bet), { evidence: [evBefore] });
  await checks.check('game.currency', `Game shows ${cur}`, credit0?.currency === cur && bet?.currency === cur, `${cur} on CREDIT and BET`, `CREDIT ${credit0?.currency ?? '?'} · BET ${bet?.currency ?? '?'}`, { evidence: [evBefore] });
  await checks.check('game.language', `Game HUD is in ${market.language}`, !!(hudBefore.credit?.expectedLanguage && hudBefore.bet?.expectedLanguage), `${market.language} labels`, `labels read: "${hudBefore.credit?.labelText}", "${hudBefore.bet?.labelText}"`, { evidence: [evBefore] });
  await checks.check('betsson.currency', `Betsson balance is in ${cur}`, betssonBefore.money.currency === cur, cur, fmt(betssonBefore.money), { evidence: ['betsson-balance-before'] });
  expect(credit0 && bet, 'Cannot continue without reading CREDIT and BET from the game').toBeTruthy();

  // 5. Locate the control and spin — the proof is what the screen does afterwards
  const reels = async () => (await game.captureRegion(layout.reels)).png;
  const noise = await measureIdleNoise(reels);
  const motionThreshold = Math.max(0.04, noise * 3);
  const spinStartedAt = Date.now();
  let motionEvidence: Buffer | undefined;
  const attempts = await test.step('Trigger the spin and watch the reels', () =>
    triggerSpin(game, market, layout, async () => {
      const m = await waitForMotion(reels, { threshold: motionThreshold, timeoutMs: 5000 });
      if (m.moved) {
        motionEvidence = m.frame;
        return { done: true, detail: `reels changed ${pct(m.peak)} (idle noise ${pct(noise)})` };
      }
      const now = await readHud(game, ocr, market, layout);
      if (now.credit?.value && !moneyEq(now.credit.value.amount, credit0!.amount)) {
        return { done: true, detail: `no motion seen but CREDIT changed to ${fmt(now.credit.value)}` };
      }
      return { done: false, detail: `no visible reaction (peak change ${pct(m.peak)} ≤ ${pct(motionThreshold)})` };
    }),
  );
  await checks.json('spin-attempts', attempts);
  if (motionEvidence) await checks.image('reels-in-motion', motionEvidence);
  const started = attempts.some((a) => a.done);
  await checks.check('spin.started', 'Spin visibly started after using the control', started, 'reels move after the control is used', attempts.map((a) => `${a.strategy}: ${a.detail}`).join(' | '), { evidence: motionEvidence ? ['reels-in-motion'] : [] });

  // 6. Spin completed: reels settle and the HUD stops changing
  const settled = await test.step('Wait for the reels to settle', () => waitForStable(reels, { threshold: Math.max(0.01, noise * 1.5), timeoutMs: 60_000 }));
  const hudAfter = await test.step('Read the settled outcome', () => readHudSettled(game, ocr, market, layout));
  const evAfter = await checks.image('game-after-spin (OCR regions)', await annotate(hudAfter.frame, hudAfter.marks, `AFTER · ${market.site}`));
  await checks.check('spin.completed', 'Spin completed and settled on screen', started && settled.stable && !!hudAfter.credit?.value, 'reels at rest and CREDIT readable', `reels ${settled.stable ? `settled after ${(settled.elapsedMs / 1000).toFixed(1)}s` : `still moving (${pct(settled.lastDiff)})`} · CREDIT ${fmt(hudAfter.credit?.value)}`, { evidence: [evAfter] });

  // 7. Settled outcome and balances
  const credit1 = hudAfter.credit?.value;
  const payout = hudAfter.win?.value?.amount ?? 0;
  const payoutSource = hudAfter.win?.value ? `WIN read on screen: ${fmt(hudAfter.win.value)}` : 'no WIN shown → payout 0';
  const bonus = market.gameText.bonusRound.test(normalize(hudAfter.ocr.text));
  await checks.info('outcome', 'Settled outcome observed', 'payout read from the screen', `${payout.toFixed(2)} ${cur} (${payoutSource})`, { note: bonus ? 'Bonus/free-spins text detected — payout may continue in later rounds' : undefined, evidence: [evAfter] });

  const gameDebit = credit1 ? round2(credit0!.amount + payout - credit1.amount) : NaN;
  await checks.check('wager.used', 'Displayed wager is the wager used for the spin', !!credit1 && !!hudAfter.bet?.value && moneyEq(hudAfter.bet.value.amount, bet!.amount) && moneyEq(gameDebit, bet!.amount), `${bet!.amount.toFixed(2)} ${cur} shown and debited`, `bet shown after: ${fmt(hudAfter.bet?.value)} · debited by game (credit before + win − credit after): ${Number.isNaN(gameDebit) ? '?' : gameDebit.toFixed(2)}`, { evidence: [evBefore, evAfter] });

  const expectedCredit = round2(credit0!.amount - bet!.amount + payout);
  await checks.check('game.balance', 'In-game balance consistent with the completed spin', !!credit1 && moneyEq(credit1.amount, expectedCredit), `${credit0!.amount.toFixed(2)} − ${bet!.amount.toFixed(2)} + ${payout.toFixed(2)} = ${expectedCredit.toFixed(2)} ${cur}`, fmt(credit1), { evidence: [evAfter] });

  const expectedBetsson = round2(betssonBefore.money.amount - bet!.amount + payout);
  const betssonAfter = await test.step('Read Betsson balance after the spin (waits for the wallet to update)', () => wallet.waitFor((m) => moneyEq(m.amount, expectedBetsson)));
  await checks.image('betsson-balance-after', betssonAfter.reading.screenshot);
  await checks.check('betsson.reconcile', 'Betsson balance reconciles: after = before − wager + payout', betssonAfter.satisfied, `${betssonBefore.money.amount.toFixed(2)} − ${bet!.amount.toFixed(2)} + ${payout.toFixed(2)} = ${expectedBetsson.toFixed(2)} ${cur}`, `${fmt(betssonAfter.reading.money)} (after ${betssonAfter.polls} reads)`, { evidence: ['betsson-balance-before', 'betsson-balance-after'] });

  // Cross-checks (INFO): never the proof, but they validate the vision
  if (credit1) await checks.info('crosscheck.game-vs-betsson', 'In-game CREDIT equals Betsson balance', betssonAfter.reading.money.amount.toFixed(2), credit1.amount.toFixed(2), { note: 'May legitimately differ with bonus money or wallet splits' });
  const server = providerTap.lastSince(spinStartedAt);
  if (server) await checks.info('crosscheck.provider', 'Provider server balance matches the CREDIT read on screen', credit1 ? credit1.amount.toFixed(2) : '?', `server balance ${server.balance?.toFixed(2)}${server.totalWin !== null ? `, total win ${server.totalWin.toFixed(2)}` : ''}`, { note: 'Passive capture of provider responses; used only to validate OCR' });
});
