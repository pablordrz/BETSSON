/** Steps inside the provider's game: only pixels (OCR / vision) and player input — never the game's DOM. */
import { fmt, moneyEq, type Money } from '../utils/money';
import { normalize, pct, sleep } from '../utils/text';
import { annotate } from '../vision/annotate';
import { pressRepeatedly } from '../vision/bet';
import type { GameScreen } from '../vision/game-screen';
import { findMessage, readHud, readHudStable, type HudReading } from '../vision/hud';
import { measureIdleNoise, waitForMotion } from '../vision/motion';
import { waitForSpinSettled } from '../vision/settle';
import { triggerSpin, type SpinAttempt } from '../vision/spin';
import { defineStep } from './step';

const reelsOf = (game: GameScreen, layout: { reels: { x: number; y: number; w: number; h: number } }) => async () =>
  (await game.captureRegion(layout.reels)).png;

/**
 * "Start the game": if the intro/splash is on screen (HUD not readable), find the continue button the player
 * sees (icon or text) and press it ONCE; then validate the game is playable = CREDIT and BET readable.
 */
export const enterGame = defineStep<{ game: GameScreen; timeoutMs?: number }, { hud: HudReading }>({
  id: 'game.enter',
  title: 'Game started: intro passed, CREDIT and BET readable',
  async run({ ocr, market, layout, controls, log }, { game, timeoutMs = 90_000 }) {
    const start = Date.now();
    let pressed = false;
    let hud = await readHud(game, ocr, market, layout);
    log(hud.credit?.value && hud.bet?.value ? 'already playable' : 'intro/loading screen (HUD not readable)', { hud: hud.ocr.text.slice(0, 80) });
    while (!(hud.credit?.value && hud.bet?.value) && Date.now() - start < timeoutMs) {
      // Only on the intro (no HUD label at all), and only once: on Pragmatic the same icon is the SPIN button.
      if (!pressed && !(hud.credit || hud.bet || hud.win)) {
        const cont = await controls.continueButton.locate(hud.frame);
        if (cont) {
          await game.clickRel(cont.x, cont.y);
          pressed = true;
          log('continue pressed', { how: cont.detail });
        }
      }
      await sleep(700);
      hud = await readHud(game, ocr, market, layout);
    }
    const ok = !!(hud.credit?.value && hud.bet?.value);
    const ev = await annotate(hud.frame, hud.marks, 'game.enter');
    return {
      ok,
      detail: ok ? `playable in ${((Date.now() - start) / 1000).toFixed(1)}s · CREDIT ${fmt(hud.credit?.value)} · BET ${fmt(hud.bet?.value)}` : `HUD not readable · OCR: "${hud.ocr.text.slice(0, 100)}"`,
      data: { hud },
      evidence: [{ name: 'playable', png: ev }],
    };
  },
});

/** CREDIT and BET read until two consecutive reads agree, in the market currency and language. */
export const readGameHud = defineStep<{ game: GameScreen }, { credit: Money; bet: Money; win: Money | null; hud: HudReading }>({
  id: 'game.readHud',
  title: 'CREDIT and BET read (stable, market currency and language)',
  retryable: true,
  async run({ ocr, market, layout, log }, { game }) {
    const { reading, stable } = await readHudStable(game, ocr, market, layout);
    const credit = reading.credit?.value;
    const bet = reading.bet?.value;
    log('HUD read', { text: reading.ocr.text.slice(0, 100), credit: credit?.amount, bet: bet?.amount, stable });
    const currencyOk = credit?.currency === market.currency && bet?.currency === market.currency;
    const languageOk = !!(reading.credit?.expectedLanguage && reading.bet?.expectedLanguage);
    const ok = stable && !!credit && !!bet && currencyOk && languageOk;
    return {
      ok,
      detail: `CREDIT ${fmt(credit)} · BET ${fmt(bet)}${stable ? '' : ' · NOT stable'}${currencyOk ? '' : ` · currency ≠ ${market.currency}`}${languageOk ? '' : ` · labels not in ${market.language}`}`,
      data: credit && bet ? { credit, bet, win: reading.win?.value ?? null, hud: reading } : undefined,
      evidence: [{ name: 'hud', png: await annotate(reading.frame, reading.marks, 'game.readHud') }],
    };
  },
});

/** Lowest wager: press "−" (found by image) in a burst, then read BET: it must not be higher than before. */
export const setMinimumBet = defineStep<{ game: GameScreen; presses?: number }, { before: Money | null; bet: Money }>({
  id: 'game.minBet',
  title: 'Wager lowered to the game minimum',
  async run({ ocr, market, layout, controls, log }, { game, presses = 10 }) {
    const before = (await readHud(game, ocr, market, layout)).bet?.value ?? null;
    const pressedOk = await pressRepeatedly(game, controls.betDown, presses);
    log(pressedOk ? `"−" pressed ${presses} times` : '"−" button not visible', { before: before?.amount });
    await sleep(400);
    const { reading, stable } = await readHudStable(game, ocr, market, layout, 3);
    const bet = reading.bet?.value;
    // At the minimum the "−" button is greyed out (not recognised): that is fine as long as BET did not go up.
    const ok = !!bet && stable && (!before || bet.amount <= before.amount);
    return { ok, detail: `BET ${fmt(before)} → ${fmt(bet)}${pressedOk ? '' : ' ("−" not available: already at the minimum?)'}`, data: bet ? { before, bet } : undefined };
  },
});

/** Idle animation level of the reels area, so idle animations are never mistaken for a spin. */
export const measureIdle = defineStep<{ game: GameScreen }, { noise: number }>({
  id: 'game.idleNoise',
  title: 'Idle animation level measured',
  retryable: true,
  async run({ layout, log }, { game }) {
    const noise = await measureIdleNoise(reelsOf(game, layout), 1000, 200);
    log('idle noise', { noise: pct(noise) });
    return { ok: noise < 0.5, detail: `idle change ${pct(noise)}`, data: { noise } };
  },
});

/**
 * Spin like a player (cascade of actions: icon by image → SPACE → calibrated point) and validate it STARTED:
 * reels move above the idle noise, or CREDIT changes. Never retried: a retry could be a second paid spin.
 */
export const spin = defineStep<{ game: GameScreen; credit: Money; noise: number }, { attempts: SpinAttempt[]; motionFrame?: Buffer }>({
  id: 'game.spin',
  title: 'Spin started (reels moved after pressing spin)',
  retryable: false,
  async run({ ocr, market, layout, controls, log }, { game, credit, noise }) {
    let motionFrame: Buffer | undefined;
    const attempts = await triggerSpin(game, controls.spin, async () => {
      const m = await waitForMotion(reelsOf(game, layout), { threshold: Math.max(0.04, noise * 3), timeoutMs: 3000, intervalMs: 120 });
      if (m.moved) {
        motionFrame = m.frame;
        return { done: true, detail: `reels moved ${pct(m.peak)} (idle ${pct(noise)})` };
      }
      const now = await readHud(game, ocr, market, layout);
      if (now.credit?.value && !moneyEq(now.credit.value.amount, credit.amount)) return { done: true, detail: `CREDIT changed to ${fmt(now.credit.value)}` };
      return { done: false, detail: `no visible reaction (peak ${pct(m.peak)})` };
    });
    for (const a of attempts) log(`${a.action}: ${a.detail}`, { done: a.done });
    const ok = attempts.some((a) => a.done);
    return { ok, detail: attempts.map((a) => `${a.action}: ${a.detail}`).join(' | '), data: { attempts, motionFrame }, evidence: motionFrame ? [{ name: 'reels moving', png: motionFrame }] : [] };
  },
});

/** The spin is over: spin button available again, reels calm, CREDIT stable. Returns the settled HUD. */
export const waitSpinEnd = defineStep<{ game: GameScreen; noise: number }, { credit: Money; win: Money | null; hud: HudReading }>({
  id: 'game.spinEnd',
  title: 'Spin completed and settled on screen',
  async run({ ocr, market, layout, controls, log }, { game, noise }) {
    const s = await waitForSpinSettled(game, ocr, market, layout, controls.spinButton, { calmThreshold: Math.max(0.01, noise * 1.5) });
    const credit = s.hud.credit?.value;
    log(s.settled ? 'settled' : 'not settled', { seconds: Number((s.elapsedMs / 1000).toFixed(1)), signals: s.detail, credit: credit?.amount, win: s.hud.win?.value?.amount ?? 0 });
    const ok = s.settled && !!credit;
    return {
      ok,
      detail: `${s.settled ? `settled in ${(s.elapsedMs / 1000).toFixed(1)}s` : 'NOT settled'} · ${s.detail} · WIN ${fmt(s.hud.win?.value ?? null)}`,
      data: credit ? { credit, win: s.hud.win?.value ?? null, hud: s.hud } : undefined,
      evidence: [{ name: 'after spin', png: await annotate(s.hud.frame, s.hud.marks, 'game.spinEnd') }],
    };
  },
});

/** A message the player reads in the game (or in Betsson's UI), e.g. insufficient balance, in the right language. */
export const findGameMessage = defineStep<{ game: GameScreen; kind: 'insufficientBalance' }, { text: string; source: string }>({
  id: 'game.message',
  title: 'Expected message visible to the player, in the market language',
  async run({ ocr, market, log }, { game, kind }) {
    const m = await findMessage(game, ocr, market, (gt) => gt[kind]);
    log(m.found ? `message found (${m.source})` : 'no message', { text: normalize(m.text).slice(0, 100), expectedLanguage: m.expectedLanguage });
    const box = m.box ? [{ box: m.box, label: kind, color: '#ff1744' }] : [];
    return {
      ok: m.found && m.expectedLanguage,
      detail: m.found ? `"${m.text.slice(0, 120)}" (${m.source}${m.expectedLanguage ? '' : ', WRONG language'})` : 'no message on screen',
      data: m.found ? { text: m.text, source: m.source } : undefined,
      evidence: [{ name: kind, png: await annotate(m.frame, box, 'game.message') }],
    };
  },
});

/**
 * Attempt a spin that SHOULD be rejected (no usable balance): press spin once, like the player, and validate
 * the reels did NOT start. Never retried.
 */
export const attemptRejectedSpin = defineStep<{ game: GameScreen; noise: number }, { peak: number; action: string }>({
  id: 'game.spinRejected',
  title: 'Attempted spin was rejected (reels did not spin)',
  retryable: false,
  async run({ layout, controls, log }, { game, noise }) {
    let action = 'none';
    for (const a of controls.spin) {
      const r = await a.perform(game);
      log(`${a.name}: ${r.detail}`);
      if (r.performed) {
        action = a.name;
        break; // one attempt only
      }
    }
    const m = await waitForMotion(reelsOf(game, layout), { threshold: Math.max(0.04, noise * 3), timeoutMs: 2500, intervalMs: 150 });
    log(m.moved ? 'reels MOVED' : 'reels did not move', { peak: pct(m.peak) });
    return { ok: action !== 'none' && !m.moved, detail: `${action} · max screen change ${pct(m.peak)}${m.moved ? ' · reels MOVED' : ''}`, data: { peak: m.peak, action } };
  },
});
