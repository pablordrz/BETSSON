import { test as base, selectors } from '@playwright/test';
import { contextOptionsFor, loginToStorageState, type StorageState } from '../src/auth/login';
import { cdpUrl, savedSession } from '../src/auth/session';
import { applyTrustedTraffic } from '../src/auth/trusted-traffic';
import { credentialsFor, type AccountKind } from '../src/config/env';
import { pragmaticLayout, type GameLayout } from '../src/config/game-layout';
import { getMarket, type MarketConfig, type MarketId } from '../src/config/markets';
import { BetssonSite } from '../src/pages/betsson-site';
import { BetssonWallet } from '../src/pages/betsson-wallet';
import { Checks } from '../src/utils/checks';
import { ProviderTap } from '../src/utils/provider-tap';
import { pragmaticControls, type GameControls } from '../src/vision/controls/game-controls';
import { Ocr } from '../src/vision/ocr';
import { StepRunner } from '../src/steps';

export interface WorkerOptions {
  marketId: MarketId;
}
export interface TestOptions {
  account: AccountKind;
}

type AuthResult = { state?: StorageState; error?: string };

interface WorkerFixtures extends WorkerOptions {
  market: MarketConfig;
  layout: GameLayout;
  ocr: Ocr;
  /** How the player recognises and uses the provider's controls (spin, continue). */
  controls: GameControls;
  /** Sessions for both accounts, created once per worker OUTSIDE any test (not traced, not recorded). */
  auth: Record<AccountKind, AuthResult>;
}

interface TestFixtures extends TestOptions {
  /** Runs atomic steps with logs, timing, evidence and a PASS/FAIL row each (src/steps). */
  steps: StepRunner;
  site: BetssonSite;
  wallet: BetssonWallet;
  checks: Checks;
  providerTap: ProviderTap;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // CDP_URL set → run inside a browser the player opened themselves (npm run browser), instead of launching one.
  // Betsson's fraud detection rejects logins from Playwright-launched browsers.
  browser: [
    async ({ playwright, browserName, headless, channel, launchOptions }, use) => {
      const cdp = cdpUrl();
      const browser = cdp
        ? await playwright.chromium.connectOverCDP(cdp)
        : await playwright[browserName].launch({ ...launchOptions, headless, channel });
      await use(browser);
      await browser.close(); // over CDP this only disconnects: the player's browser stays open
    },
    { scope: 'worker' },
  ],

  marketId: ['es', { scope: 'worker', option: true }],
  market: [async ({ marketId }, use) => use(getMarket(marketId)), { scope: 'worker' }],
  layout: [async ({}, use) => use(pragmaticLayout), { scope: 'worker' }],

  ocr: [
    async ({}, use) => {
      const ocr = new Ocr();
      await use(ocr);
      await ocr.terminate();
    },
    { scope: 'worker' },
  ],

  controls: [async ({ layout, ocr, market }, use) => use(pragmaticControls(layout, ocr, market)), { scope: 'worker' }],

  auth: [
    async ({ browser, market }, use) => {
      const out = {} as Record<AccountKind, AuthResult>;
      // CDP mode: the player logged in by hand in their own browser — never submit the login form.
      if (cdpUrl()) return use({ funded: {}, empty: {} });
      for (const kind of ['funded', 'empty'] as AccountKind[]) {
        // 1) session saved by a manual login (npm run login) — no automated form submission at all
        const saved = savedSession(market.id, kind);
        if (saved) {
          out[kind] = { state: saved };
          continue;
        }
        // 2) automated login with credentials from the environment
        const creds = credentialsFor(market.id, kind);
        if (!creds) {
          out[kind] = { error: `no credentials for the ${kind} account (see .env.example)` };
          continue;
        }
        try {
          out[kind] = { state: await loginToStorageState(browser, market, creds) };
        } catch (e) {
          // first line + the locator Playwright was waiting for (never contains the password)
          const lines = (e as Error).message.split('\n');
          const waiting = lines.find((l) => /waiting for/.test(l))?.trim();
          out[kind] = { error: `login failed: ${lines[0]}${waiting ? ` (${waiting})` : ''}` };
        }
      }
      await use(out);
    },
    { scope: 'worker', timeout: 240_000 },
  ],

  account: ['funded', { option: true }],

  context: async ({ browser, market, auth, account }, use, testInfo) => {
    if (cdpUrl()) {
      // The player's own browser profile: already logged in, game session started by the player.
      const context = browser.contexts()[0];
      // Fresh profile → the checker logs in itself, in that real browser (outside the trace: no password in it)
      selectors.setTestIdAttribute('data-test-id');
      const lobby = new BetssonSite(context.pages()[0] ?? (await context.newPage()), market);
      await lobby.open(lobby.entryPath()); // login (if needed) returns here: the game page or the Pragmatic Play page
      if (!(await lobby.isLoggedIn())) {
        const creds = credentialsFor(market.id, account);
        if (!creds) testInfo.skip(true, `${market.site}: no credentials for the ${account} account`);
        await lobby.login(creds!);
      }
      const traced = await context.tracing.start({ screenshots: true, snapshots: true }).then(
        () => true,
        () => false, // already traced by Playwright
      );
      await use(context);
      if (traced) {
        // same policy as playwright.config.ts: keep the trace only when the test failed (or EVIDENCE=all)
        const keep = testInfo.status !== testInfo.expectedStatus || process.env.EVIDENCE === 'all';
        const file = testInfo.outputPath('trace.zip');
        await context.tracing.stop(keep ? { path: file } : {});
        if (keep) await testInfo.attach('trace', { path: file, contentType: 'application/zip' });
      }
      return; // never close the player's profile
    }
    const a = auth[account];
    if (a.error?.startsWith('no credentials')) testInfo.skip(true, `${market.site}: ${a.error}`);
    if (!a.state) throw new Error(`${market.site} ${account} account: ${a.error}`);
    const context = await browser.newContext({
      ...contextOptionsFor(market),
      storageState: a.state,
      recordVideo: { dir: testInfo.outputPath('videos'), size: { width: 1600, height: 900 } },
    });
    await applyTrustedTraffic(context, market);
    await use(context);
    const videos = context.pages().map((p) => p.video()).filter((v) => !!v);
    await context.close();
    const keepVideo = testInfo.status !== testInfo.expectedStatus || process.env.EVIDENCE === 'all';
    for (const [i, v] of videos.entries()) {
      if (keepVideo) await testInfo.attach(`video-${i}`, { path: await v.path(), contentType: 'video/webm' });
      else await v.delete().catch(() => undefined);
    }
  },

  // CDP mode: the tab where the player opened the game; otherwise a new tab.
  page: async ({ context, market }, use) => {
    // Reuse the tab where the login happened: a fresh tab may not carry the session (Betsson shows the login again).
    const pages = cdpUrl() ? context.pages() : [];
    const open =
      pages.find((p) => new URL(p.url()).pathname.startsWith(market.gamePathPrefix)) ??
      pages.find((p) => p.url().startsWith(market.baseUrl));
    const page = open ?? (await context.newPage());
    if (open) await open.bringToFront();
    await use(page);
    if (!open) await page.close().catch(() => undefined);
  },

  site: async ({ page, market }, use, testInfo) => {
    const site = new BetssonSite(page, market);
    await use(site);
    // final state of the page, with personal data masked — only when the test failed (or EVIDENCE=all)
    if (testInfo.status === testInfo.expectedStatus && process.env.EVIDENCE !== 'all') return;
    const shot = await site.maskedScreenshot().catch(() => undefined);
    if (shot) await testInfo.attach('final-page (masked)', { body: shot, contentType: 'image/png' });
  },

  wallet: async ({ context, page, market }, use) => {
    const wallet = new BetssonWallet(context, page, market);
    await use(wallet);
    await wallet.close();
  },

  checks: async ({ market }, use, testInfo) => {
    await use(new Checks(testInfo, market, testInfo.title));
  },

  steps: async ({ site, wallet, ocr, market, layout, controls, checks }, use, testInfo) => {
    const runner = new StepRunner({ site, wallet, ocr, market, layout, controls }, checks, testInfo, { quiet: process.env.STEP_LOGS === '0' });
    await use(runner);
    await runner.attachLog();
  },

  providerTap: async ({ page }, use) => {
    await use(new ProviderTap(page));
  },
});

export { expect } from '@playwright/test';
