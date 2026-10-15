/** Steps on Betsson's own UI (its DOM is fair game: it is not the provider's canvas). */
import type { ProviderEvidence } from '../pages/betsson-site';
import { fmt, type Money } from '../utils/money';
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

/** Regulated game session started (notice acknowledged, most protective limits chosen) — or not needed. */
export const startGameSession = defineStep<void, { actions: string[] }>({
  id: 'site.gameSession',
  title: 'Regulated game session started (shortest time, lowest loss limit)',
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
