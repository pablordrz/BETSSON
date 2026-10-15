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

  /** OneTrust banner: reject non-essential cookies (most privacy-preserving choice). */
  async handleCookies(): Promise<void> {
    const { page, market } = this;
    const reject = page.getByRole('button', { name: market.ui.cookiesRejectAll }).first();
    if (await visible(reject, 3000)) return reject.click();
    const settings = page.getByRole('button', { name: market.ui.cookiesSettings }).first();
    if (await visible(settings, 5000)) {
      await settings.click();
      const rejectInCenter = page.getByRole('button', { name: market.ui.cookiesRejectAll }).first();
      if (await visible(rejectInCenter, 5000)) await rejectInCenter.click();
    }
  }

  async login(creds: Credentials): Promise<void> {
    const { page, market } = this;
    await this.open(`${market.loginPath}?returnUrl=${encodeURIComponent(market.providerPath)}`);
    const email = page.getByTestId(market.testIds.emailInput);
    if (!(await visible(email, 10_000))) await page.getByTestId(market.testIds.loginButton).first().click();
    await email.fill(creds.username);
    await page.getByTestId(market.testIds.passwordInput).fill(creds.password);
    await page.getByTestId(market.testIds.loginSubmit).first().click();
    await this.waitForLoggedIn();
  }

  async waitForLoggedIn(timeout = 45_000): Promise<void> {
    await this.page.getByTestId(this.market.testIds.loginButton).first().waitFor({ state: 'hidden', timeout });
  }

  async isLoggedIn(): Promise<boolean> {
    await this.page.waitForTimeout(2000);
    return !(await visible(this.page.getByTestId(this.market.testIds.loginButton).first(), 3000));
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
