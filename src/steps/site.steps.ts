/** Steps on Betsson's own UI (its DOM is fair game: it is not the provider's canvas). */
import type { ProviderEvidence } from '../pages/betsson-site';
import { fmt, moneyEq, parseMoney, type Money } from '../utils/money';
import { sleep } from '../utils/text';
import { GameScreen, isBlank } from '../vision/game-screen';
import { defineStep } from './step';

/** The session injected by the fixtures is valid: the player sees their balance in the header. */
export const checkLoggedIn = defineStep<void, { loggedIn: true }>({
  id: 'site.loggedIn',
  title: 'Player is logged in (balance visible in the header)',
  retryable: true,
  async run({ site, market, log }) {
    if (!site.page.url().startsWith(market.baseUrl)) await site.open(site.entryPath());
    const ok = await site.isLoggedIn();
    log(ok ? 'header shows the balance' : 'header shows the login button');
    return { ok, detail: ok ? 'balance visible in the header' : 'not logged in', data: ok ? { loggedIn: true } : undefined };
  },
});

/** Game page reached (GAME_SLUG, or first slot of the Pragmatic Play page) and it is a Pragmatic Play game. */
export const goToGame = defineStep<void, ProviderEvidence>({
  id: 'site.goToGame',
  title: 'Pragmatic Play game page opened',
  retryable: true,
  async run({ site, log }) {
    const evidence = await site.goToGame();
    log('game page', { slug: evidence.slug, detailId: evidence.gameDetailId });
    const ok = /pragmatic/i.test(evidence.gameDetailId ?? '');
    return { ok, detail: `game "${evidence.slug}" · detail id ${evidence.gameDetailId ?? 'not found'}`, data: evidence };
  },
});

/** Regulated game session started (notice acknowledged, 5 h play time, lowest loss limit) — or not needed. */
export const startGameSession = defineStep<void, { actions: string[] }>({
  id: 'site.gameSession',
  title: 'Regulated game session started (5 h play time, lowest loss limit)',
  async run({ site, log }) {
    const actions = await site.startGameSession();
    for (const a of actions) log(a);
    const stillThere = await site.gameSessionDialogVisible();
    return {
      ok: !stillThere,
      detail: stillThere ? 'a game-session dialog is still on screen' : actions.join(' → ') || 'not needed (session already active)',
      data: { actions },
    };
  },
});

/** The provider's game canvas is on screen and actually rendered (not blank). */
export const attachGame = defineStep<void, { game: GameScreen }>({
  id: 'game.attach',
  title: 'Game canvas visible and rendered',
  retryable: true,
  async run({ site, layout, log }) {
    const game = await GameScreen.attach(site.page, layout.frameUrl, 60_000);
    const frame = await game.capture();
    const blank = await isBlank(frame);
    log('canvas', { frameUrl: game.frame.url().slice(0, 80), stdev: Number(blank.stdev.toFixed(1)) });
    return { ok: !blank.blank, detail: blank.blank ? `blank canvas (stdev ${blank.stdev.toFixed(1)})` : 'canvas rendered', data: { game }, evidence: [{ name: 'canvas', png: frame }] };
  },
});

/** Betsson balance as shown in Betsson's header, in the market currency. */
export const readBetssonBalance = defineStep<void, { balance: Money }>({
  id: 'betsson.readBalance',
  title: 'Betsson balance read in the market currency',
  retryable: true,
  async run({ wallet, market, log }) {
    const r = await wallet.read();
    log('header balance', { read: r.money.raw });
    const ok = r.money.currency === market.currency;
    return { ok, detail: `${fmt(r.money)}`, data: { balance: r.money }, evidence: [{ name: 'balance', png: r.screenshot }] };
  },
});

/**
 * End of the journey: leave the game (back to the Pragmatic Play page, same tab) and check that the balance in
 * Betsson's header (DOM) equals the last CREDIT read inside the game. Polls: the wallet can lag the game.
 */
export const exitGameBalanceMatches = defineStep<{ credit: Money; timeoutMs?: number }, { balance: Money }>({
  id: 'site.exitBalance',
  title: 'After leaving the game, Betsson balance (page) = last in-game CREDIT',
  async run({ site, market, log }, { credit, timeoutMs = 30_000 }) {
    await site.open(market.providerPath);
    const el = site.page.locator(market.selectors.headerBalance).filter({ hasText: /\d/ }).first();
    await el.waitFor({ state: 'visible', timeout: 20_000 });
    const deadline = Date.now() + timeoutMs;
    let balance = parseMoney(await el.innerText());
    let reads = 1;
    while (!(balance && moneyEq(balance.amount, credit.amount)) && Date.now() < deadline) {
      await sleep(2000);
      balance = parseMoney(await el.innerText());
      reads++;
    }
    log('header balance after leaving the game', { read: balance?.raw, credit: credit.amount, reads });
    const ok = !!balance && balance.currency === market.currency && moneyEq(balance.amount, credit.amount);
    return {
      ok,
      detail: `in-game CREDIT ${fmt(credit)} · Betsson page ${fmt(balance)} (${reads} read${reads > 1 ? 's' : ''})${ok ? '' : ' · MISMATCH'}`,
      data: balance ? { balance } : undefined,
      evidence: [{ name: 'Betsson balance', png: await el.screenshot() }],
    };
  },
});
