import type { Locator, Page } from '@playwright/test';
import type { Credentials } from '../config/env';
import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import { GameScreen } from '../vision/game-screen';

const visible = (l: Locator, timeout = 8000) =>
  l
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

export interface ProviderEvidence {
  /** The game was found on the Pragmatic Play provider page. */
  listedOnProviderPage: boolean;
  /** Title shown on the provider page tile. */
  tileTitle: string | null;
  /** data-test-id of the game-detail element on the game page, e.g. "game-detail-pragmaticPlayBigBassBlast". */
  gameDetailId: string | null;
}

export interface LaunchResult {
  game: GameScreen;
  provider: ProviderEvidence;
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
    const sdk = page.locator('#onetrust-consent-sdk');
    const banner = sdk.locator('#onetrust-banner-sdk');
    if (!(await visible(banner, 6000))) return;
    const rejectAll = sdk.locator('#onetrust-reject-all-handler').or(banner.getByRole('button', { name: market.ui.cookiesRejectAll })).first();
    if (await visible(rejectAll, 1000)) return rejectAll.click();
    // No reject button on the banner: open the preference center and save with only the necessary cookies
    await sdk.locator('#onetrust-pc-btn-handler').or(banner.getByRole('button', { name: market.ui.cookiesSettings })).first().click();
    const center = sdk.locator('#onetrust-pc-sdk');
    const save = center
      .locator('.ot-pc-refuse-all-handler, .save-preference-btn-handler')
      .or(center.getByRole('button', { name: market.ui.cookiesRejectAll }))
      .first();
    if (await visible(save, 5000)) await save.click();
    await banner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  }

  /**
   * Logs in at a human pace: the site's fraud detection rejects forms filled and submitted
   * within milliseconds ("Actualiza la página y vuelve a intentarlo en breve").
   */
  async login(creds: Credentials): Promise<void> {
    const { page, market } = this;
    const pause = (min: number, max: number) => page.waitForTimeout(min + Math.random() * (max - min));
    await this.open(`${market.loginPath}?returnUrl=${encodeURIComponent(market.providerPath)}`);
    // Let the site's fraud-detection scripts finish loading before touching the form:
    // submitting before they report back gets "Actualiza la página y vuelve a intentarlo en breve".
    await page.waitForLoadState('load').catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await pause(4000, 6000);
    const email = page.getByTestId(market.testIds.emailInput);
    if (!(await visible(email, 10_000))) {
      await page.getByTestId(market.testIds.loginButton).first().click();
      await pause(1500, 2500);
    }
    await this.typeLikeHuman(email, creds.username);
    await pause(800, 1500);
    await this.typeLikeHuman(page.getByTestId(market.testIds.passwordInput), creds.password);
    await pause(1000, 2000);
    await page.getByTestId(market.testIds.loginSubmit).first().click();

    const error = page.getByTestId(market.testIds.loginError).first();
    const outcome = await Promise.race([
      this.waitForLoggedIn().then(() => 'ok' as const, () => 'timeout' as const),
      error.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'error' as const, () => 'timeout' as const),
    ]);
    if (outcome === 'timeout') throw new Error('Login did not complete within 45s (no error shown by Betsson)');
    if (outcome === 'error') throw new Error(`Betsson rejected the login: "${(await error.innerText()).trim()}"`);
  }

  private async typeLikeHuman(input: Locator, text: string): Promise<void> {
    await input.click();
    await input.clear();
    await input.pressSequentially(text, { delay: 60 + Math.random() * 60 });
  }

  async waitForLoggedIn(timeout = 45_000): Promise<void> {
    await this.page.getByTestId(this.market.testIds.loginButton).first().waitFor({ state: 'hidden', timeout });
  }

  async isLoggedIn(): Promise<boolean> {
    await this.page.waitForTimeout(2000);
    return !(await visible(this.page.getByTestId(this.market.testIds.loginButton).first(), 3000));
  }

  /** Slug of the game this tab already shows (/casino/tragaperras-slots/<slug>), if any. */
  openGameSlug(): string | null {
    const path = new URL(this.page.url()).pathname;
    return path.startsWith(this.market.gamePathPrefix) ? path.slice(this.market.gamePathPrefix.length).split('/')[0] || null : null;
  }

  /**
   * The player already opened the game in Real Play by hand (game session and its limits are the player's
   * regulatory choices, never automated). Attaches to that tab and checks, in a second tab, that the game
   * is listed on the Pragmatic Play provider page.
   */
  async attachToOpenGame(layout: GameLayout): Promise<LaunchResult> {
    const { page, market } = this;
    const slug = this.openGameSlug();
    if (!slug) throw new Error(`Open a Pragmatic Play game in Real Play first (no tab on ${market.gamePathPrefix}<game>)`);
    const detail = page.locator(`[data-test-id^="${market.testIds.gameDetailPrefix}"]`).first();
    const gameDetailId = (await visible(detail, 5000)) ? await detail.getAttribute('data-test-id') : null;
    const game = await GameScreen.attach(page, layout.frameUrl, 30_000);

    const tab = await page.context().newPage();
    try {
      const lobby = new BetssonSite(tab, market);
      await lobby.open(market.providerPath);
      const tileLink = tab.locator(`a[href$="${market.gamePathPrefix}${slug}"]`).first();
      let listed = await visible(tileLink, 10_000);
      for (let i = 0; !listed && i < 15; i++) {
        const more = tab.getByTestId(market.testIds.showMore).first();
        if (!(await visible(more, 3000))) break;
        await more.click();
        listed = await visible(tileLink, 5000);
      }
      const tileTitle = listed ? (await tileLink.innerText().catch(() => '')).trim() || null : null;
      return { game, provider: { listedOnProviderPage: listed, tileTitle, gameDetailId } };
    } finally {
      await tab.close();
      await page.bringToFront();
    }
  }

  /** Attaches to a game the player opened (CDP mode), otherwise launches it from the provider page. */
  async openGame(layout: GameLayout): Promise<LaunchResult> {
    return this.openGameSlug() ? this.attachToOpenGame(layout) : this.launchGame(layout);
  }

  /**
   * Opens the Pragmatic Play provider page, finds the configured game THERE (scope of the challenge),
   * opens it and enters Real Play. Returns the game canvas and the evidence that the game is Pragmatic Play.
   */
  async launchGame(layout: GameLayout): Promise<LaunchResult> {
    const { page, market } = this;
    await this.open(market.providerPath);
    if (!(await this.isLoggedIn())) {
      throw new Error('Not logged in after restoring the session (login button still visible). Check the test account.');
    }

    const tileLink = page.locator(`a[href$="${market.gamePathPrefix}${market.gameSlug}"]`).first();
    let listed = await visible(tileLink, 10_000);
    for (let i = 0; !listed && i < 15; i++) {
      const more = page.getByTestId(market.testIds.showMore).first();
      if (!(await visible(more, 3000))) break;
      await more.click();
      listed = await visible(tileLink, 5000);
    }
    const tileTitle = listed ? (await tileLink.innerText().catch(() => '')).trim() || null : null;
    if (listed) await tileLink.click();
    else await page.goto(this.url(market.gamePathPrefix + market.gameSlug), { waitUntil: 'domcontentloaded' });

    const detail = page.locator(`[data-test-id^="${market.testIds.gameDetailPrefix}"]`).first();
    const gameDetailId = (await visible(detail, 15_000)) ? await detail.getAttribute('data-test-id') : null;

    await page.getByTestId(market.testIds.playForReal).first().click();
    await this.handleSessionLimits();
    const game = await GameScreen.attach(page, layout.frameUrl);
    return { game, provider: { listedOnProviderPage: listed, tileTitle, gameDetailId } };
  }

  /**
   * Spanish regulation: before a slots session the player sets a time/amount limit.
   * CALIBRATE once logged in — this picks the first option of each control and confirms.
   */
  async handleSessionLimits(): Promise<boolean> {
    const { page, market } = this;
    const dialog = page.getByRole('dialog').filter({ hasText: market.ui.sessionLimitsDialog }).first();
    if (!(await visible(dialog, 8000))) return false;
    for (const radio of await dialog.getByRole('radio').all()) {
      await radio.check().catch(() => undefined);
      break;
    }
    for (const select of await dialog.locator('select').all()) {
      await select.selectOption({ index: 1 }).catch(() => undefined);
    }
    await dialog.getByRole('button', { name: market.ui.sessionLimitsConfirm }).first().click();
    return true;
  }

  /** Full-page screenshot with personal data masked. */
  async maskedScreenshot(): Promise<Buffer> {
    return this.page.screenshot({ mask: this.market.selectors.mask.map((s) => this.page.locator(s)), maskColor: '#222' });
  }
}
