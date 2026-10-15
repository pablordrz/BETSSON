import type { Locator, Page } from '@playwright/test';
import type { Credentials } from '../config/env';
import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import { GameScreen } from '../vision/game-screen';

/** Browser contexts where the cookie banner was already answered. */
const cookiesHandled = new WeakSet<object>();

const visible = (l: Locator, timeout = 8000) =>
  l
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

export interface ProviderEvidence {
  /** Slug of the game page that was opened. */
  slug: string | null;
  /** data-test-id of the game-detail element on the game page, e.g. "game-detail-pragmaticPlayBigBassBlast". */
  gameDetailId: string | null;
}

export interface LaunchResult {
  game: GameScreen;
  provider: ProviderEvidence;
  /** Regulated game-session steps taken before the game started (empty if none were needed). */
  gameSession: string[];
}

/**
 * Betsson.es UI (lobby, login, game launch). This is Betsson's own DOM (web components), so DOM locators
 * are legitimate here. getByTestId uses `data-test-id` and pierces shadow roots.
 */
export class BetssonSite {
  constructor(
    readonly page: Page,
    readonly market: MarketConfig,
  ) {}

  url(path: string) {
    return this.market.baseUrl + path;
  }

  async open(path: string): Promise<void> {
    await this.page.goto(this.url(path), { waitUntil: 'domcontentloaded' });
    await this.handleCookies();
  }

  /**
   * OneTrust banner: reject non-essential cookies (most privacy-preserving choice).
   * Scoped to OneTrust's own container: Betsson's page has another "Configuración de cookies" button
   * underneath the banner, and clicking that one hangs because the banner covers it.
   */
  async handleCookies(): Promise<void> {
    const { page, market } = this;
    if (cookiesHandled.has(page.context())) return; // answered once: the site remembers it for the whole session
    const sdk = page.locator('#onetrust-consent-sdk');
    const banner = sdk.locator('#onetrust-banner-sdk');
    if (!(await visible(banner, 4000))) return; // not shown (yet): checked again on the next page
    try {
      await this.answerCookieBanner(sdk, banner);
    } finally {
      if (!(await banner.isVisible().catch(() => false))) cookiesHandled.add(page.context());
    }
  }

  private async answerCookieBanner(sdk: Locator, banner: Locator): Promise<void> {
    const { market } = this;
    // Never let the cookie banner block the journey: short timeouts, and a banner that cannot be used is ignored.
    const click = (l: Locator) => l.click({ timeout: 5000 }).then(() => true, () => false);
    const rejectAll = sdk.locator('#onetrust-reject-all-handler').or(banner.getByRole('button', { name: market.ui.cookiesRejectAll })).first();
    if ((await visible(rejectAll, 1000)) && (await click(rejectAll))) return;
    // No reject button on the banner: open the preference center and save with only the necessary cookies
    if (!(await click(sdk.locator('#onetrust-pc-btn-handler').or(banner.getByRole('button', { name: market.ui.cookiesSettings })).first()))) return;
    const center = sdk.locator('#onetrust-pc-sdk');
    const save = center
      .locator('.ot-pc-refuse-all-handler, .save-preference-btn-handler')
      .or(center.getByRole('button', { name: market.ui.cookiesRejectAll }))
      .first();
    if (await visible(save, 5000)) await click(save);
    await banner.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
  }

  /**
   * Logs in at a human pace: the site's fraud detection rejects forms filled and submitted
   * within milliseconds ("Actualiza la página y vuelve a intentarlo en breve").
   */
  async login(creds: Credentials): Promise<void> {
    const { page, market } = this;
    const pause = (min: number, max: number) => page.waitForTimeout(min + Math.random() * (max - min));
    await this.open(`${market.loginPath}?returnUrl=${encodeURIComponent(this.entryPath())}`);
    // Let the site's fraud-detection scripts finish loading before touching the form:
    // submitting before they report back gets "Actualiza la página y vuelve a intentarlo en breve".
    await page.waitForLoadState('load').catch(() => undefined);
    await pause(1500, 2500);
    await this.handleCookies(); // the banner can appear late and cover the form
    const email = page.getByTestId(market.testIds.emailInput);
    if (!(await visible(email, 10_000)) && (await this.isLoggedIn(3000))) return; // the session was already there
    if (!(await visible(email, 1000))) {
      await page.getByTestId(market.testIds.loginButton).first().click();
      await pause(600, 1000);
    }
    await this.typeLikeHuman(email, creds.username);
    await pause(300, 600);
    await this.typeLikeHuman(page.getByTestId(market.testIds.passwordInput), creds.password);
    await pause(400, 800);
    await page.getByTestId(market.testIds.loginSubmit).first().click();

    const error = page.getByTestId(market.testIds.loginError).first();
    const outcome = await Promise.race([
      this.waitForLoggedIn().then(() => 'ok' as const, () => 'timeout' as const),
      error.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'error' as const, () => 'timeout' as const),
    ]);
    if (outcome === 'timeout') throw new Error('Login did not complete within 45s (no error shown by Betsson)');
    if (outcome === 'error') throw new Error(`Betsson rejected the login: "${(await error.innerText()).trim()}"`);
  }

  /**
   * Types like a person and VERIFIES the field holds exactly the text (the page may still be hydrating and drop
   * keystrokes). Retries a few times; the value itself is never logged.
   */
  private async typeLikeHuman(input: Locator, text: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await input.click();
      await input.clear();
      await input.pressSequentially(text, { delay: 30 + Math.random() * 30 });
      if ((await input.inputValue().catch(() => '')) === text) return;
      await this.page.waitForTimeout(500 * attempt);
    }
    throw new Error('Could not type into the login form (the field did not keep the typed text)');
  }

  /**
   * Logged in = the player SEES their balance in the header. (The login button also disappears for a moment
   * while the page reloads after submitting, so its absence is not proof.)
   */
  async waitForLoggedIn(timeout = 45_000): Promise<void> {
    await this.page.locator(this.market.selectors.headerBalance).first().waitFor({ state: 'visible', timeout });
  }

  /** Waits for the header to settle on one of its two states: balance (logged in) or login button. */
  async isLoggedIn(timeout = 10_000): Promise<boolean> {
    const balance = this.page.locator(this.market.selectors.headerBalance).first();
    const login = this.page.getByTestId(this.market.testIds.loginButton).first();
    const state = await Promise.race([
      balance.waitFor({ state: 'visible', timeout }).then(() => 'in' as const, () => 'unknown' as const),
      login.waitFor({ state: 'visible', timeout }).then(() => 'out' as const, () => 'unknown' as const),
    ]);
    if (state !== 'out') return state === 'in';
    // the header may render "logged out" for an instant before the session is restored
    return visible(balance, 3000);
  }

  /** Where the journey starts after login: the configured game page, or the Pragmatic Play provider page. */
  entryPath(): string {
    return this.market.gameSlug ? this.market.gamePathPrefix + this.market.gameSlug : this.market.providerPath;
  }

  /** Slug of the game this tab already shows (/casino/tragaperras-slots/<slug>), if any. */
  openGameSlug(): string | null {
    const path = new URL(this.page.url()).pathname;
    return path.startsWith(this.market.gamePathPrefix) ? path.slice(this.market.gamePathPrefix.length).split('/')[0] || null : null;
  }

  /**
   * After login, goes straight to the Pragmatic Play provider page and opens a game listed THERE:
   * GAME_SLUG if set, otherwise the first slot on the page. Then enters Real Play.
   * If this tab already shows a game (opened by the player), it just attaches to it.
   * Pragmatic Play evidence: listed on the provider page + the game page's `game-detail-pragmaticPlay…` element.
   */
  async openGame(layout: GameLayout): Promise<LaunchResult> {
    const provider = await this.goToGame();
    const gameSession = await this.startGameSession();
    const game = await GameScreen.attach(this.page, layout.frameUrl);
    return { game, provider, gameSession };
  }

  /**
   * Navigates to the game page (GAME_SLUG, or the first slot of the Pragmatic Play page) unless this tab already
   * shows a game, and presses "play for real" if offered. Returns the evidence that the game is Pragmatic Play.
   */
  async goToGame(): Promise<ProviderEvidence> {
    const { page, market } = this;
    if (!this.openGameSlug() && market.gameSlug) {
      await this.open(this.entryPath()); // straight to that game's page
    } else if (!this.openGameSlug()) {
      if (new URL(page.url()).pathname !== market.providerPath) await this.open(market.providerPath);
      if (!(await this.isLoggedIn())) throw new Error('Not logged in (login button still visible). Check the test account.');
      const tile = page.locator(`a[href*="${market.gamePathPrefix}"]`).first(); // first slot listed
      if (!(await visible(tile, 20_000))) throw new Error(`No slot tile on ${market.providerPath}`);
      await tile.click();
      await page.waitForURL((u) => u.pathname.startsWith(market.gamePathPrefix), { timeout: 30_000 });
    }
    const slug = this.openGameSlug();
    const detail = page.locator(`[data-test-id^="${market.testIds.gameDetailPrefix}"]`).first();
    const gameDetailId = (await visible(detail, 15_000)) ? await detail.getAttribute('data-test-id') : null;
    const playForReal = page.getByTestId(market.testIds.playForReal).first();
    if (await visible(playForReal, 5000)) await playForReal.click();
    return { slug, gameDetailId };
  }

  /** True while a regulated game-session dialog (notice or limits) is on screen. */
  async gameSessionDialogVisible(): Promise<boolean> {
    const ui = this.market.ui.gameSession;
    const dialogs = this.page.getByRole('dialog').filter({ hasText: new RegExp(`${ui.notice.source}|${ui.limits.source}`, 'i') });
    return dialogs.first().isVisible().catch(() => false);
  }


  /**
   * Regulated game session (Spain), done as the player does it: the optional responsible-gambling notice →
   * "Iniciar sesión"; the limits dialog → the MOST PROTECTIVE choices (shortest play time, lowest loss limit) →
   * "Iniciar sesión"; or the game placeholder's "Iniciar una nueva sesión". Returns the steps taken (for the report).
   */
  async startGameSession(timeoutMs = 20_000): Promise<string[]> {
    const { page, market } = this;
    const ui = market.ui.gameSession;
    const steps: string[] = [];
    const deadline = Date.now() + timeoutMs;
    const dialog = (text: RegExp) => page.getByRole('dialog').filter({ hasText: text }).last();
    while (Date.now() < deadline && steps.length < 6) {
      const limits = dialog(ui.limits);
      const notice = dialog(ui.notice);
      const placeholder = page.getByRole('button', { name: /iniciar una nueva sesi[oó]n/i }).first();
      const seen = await Promise.race([
        limits.waitFor({ state: 'visible', timeout: 4000 }).then(() => 'limits' as const, () => null),
        notice.waitFor({ state: 'visible', timeout: 4000 }).then(() => 'notice' as const, () => null),
        placeholder.waitFor({ state: 'visible', timeout: 4000 }).then(() => 'placeholder' as const, () => null),
      ]);
      if (!seen) break; // nothing regulatory on screen: the game is starting
      if (seen === 'limits') {
        // preferred play time (5 h); the first option only if that one is not offered
        const preferred = limits.getByRole('button', { name: ui.sessionTime }).first();
        const hasPreferred = await visible(preferred, 2000);
        const time = hasPreferred ? preferred : limits.getByRole('button', { name: ui.timeOption }).first();
        const loss = limits.getByRole('button', { name: ui.lossOption }).first();
        const timeText = (await time.innerText().catch(() => '')).trim();
        const lossText = (await loss.innerText().catch(() => '')).trim();
        await time.click().catch(() => undefined);
        await loss.click().catch(() => undefined);
        await limits.getByRole('button', { name: ui.start }).last().click();
        steps.push(`game-session limits: play time "${timeText || '?'}"${hasPreferred ? '' : ' (5 h not offered)'}, loss limit "${lossText || '?'}"`);
        await limits.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
        break; // the session is started
      }
      if (seen === 'notice') {
        await notice.getByRole('button', { name: ui.start }).first().click();
        steps.push('responsible-gambling notice acknowledged');
      } else {
        await placeholder.click();
        steps.push('"start a new game session" pressed');
      }
    }
    return steps;
  }

  /** Full-page screenshot with personal data masked. */
  async maskedScreenshot(): Promise<Buffer> {
    return this.page.screenshot({ mask: this.market.selectors.mask.map((s) => this.page.locator(s)), maskColor: '#222' });
  }
}
