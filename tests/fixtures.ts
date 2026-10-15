import { test as base } from '@playwright/test';
import { loginToStorageState, type StorageState } from '../src/auth/login';
import { credentialsFor, type AccountKind } from '../src/config/env';
import { pragmaticLayout, type GameLayout } from '../src/config/game-layout';
import { getMarket, type MarketConfig, type MarketId } from '../src/config/markets';
import { BetssonSite } from '../src/pages/betsson-site';
import { BetssonWallet } from '../src/pages/betsson-wallet';
import { Checks } from '../src/utils/checks';
import { ProviderTap } from '../src/utils/provider-tap';
import { Ocr } from '../src/vision/ocr';

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
  /** Sessions for both accounts, created once per worker OUTSIDE any test (not traced, not recorded). */
  auth: Record<AccountKind, AuthResult>;
}

interface TestFixtures extends TestOptions {
  site: BetssonSite;
  wallet: BetssonWallet;
  checks: Checks;
  providerTap: ProviderTap;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
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

  auth: [
    async ({ browser, market }, use) => {
      const out = {} as Record<AccountKind, AuthResult>;
      for (const kind of ['funded', 'empty'] as AccountKind[]) {
        const creds = credentialsFor(market.id, kind);
        if (!creds) {
          out[kind] = { error: `no credentials for the ${kind} account (see .env.example)` };
          continue;
        }
        try {
          out[kind] = { state: await loginToStorageState(browser, market, creds) };
        } catch (e) {
          out[kind] = { error: `login failed: ${(e as Error).message.split('\n')[0]}` };
        }
      }
      await use(out);
    },
    { scope: 'worker', timeout: 240_000 },
  ],

  account: ['funded', { option: true }],

  // Every test context starts already authenticated as `account`.
  storageState: async ({ auth, account, market }, use, testInfo) => {
    const a = auth[account];
    if (a.error?.startsWith('no credentials')) testInfo.skip(true, `${market.site}: ${a.error}`);
    if (!a.state) throw new Error(`${market.site} ${account} account: ${a.error}`);
    await use(a.state);
  },

  site: async ({ page, market }, use, testInfo) => {
    const site = new BetssonSite(page, market);
    await use(site);
    // final state of the page, with personal data masked
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

  providerTap: async ({ page }, use) => {
    await use(new ProviderTap(page));
  },
});

export { expect } from '@playwright/test';
