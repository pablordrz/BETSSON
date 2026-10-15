import { selectors, type Browser, type BrowserContextOptions } from '@playwright/test';
import { proxyFor, type Credentials } from '../config/env';
import type { MarketConfig } from '../config/markets';
import { BetssonSite } from '../pages/betsson-site';
import { applyTrustedTraffic } from './trusted-traffic';

export type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

export const contextOptionsFor = (market: MarketConfig): BrowserContextOptions => ({
  locale: market.locale,
  timezoneId: market.timezoneId,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  proxy: proxyFor(market.id),
});

/**
 * Logs in in a throw-away context that is neither traced nor recorded, and returns the session.
 * The test then starts already authenticated, so passwords never appear in traces, videos or reports.
 */
export async function loginToStorageState(browser: Browser, market: MarketConfig, creds: Credentials): Promise<StorageState> {
  // This runs in a worker fixture, before Playwright applies `use.testIdAttribute` (a test-scoped option):
  // without this, getByTestId would look for the default `data-testid` and find nothing on betsson.es.
  selectors.setTestIdAttribute('data-test-id');
  const context = await browser.newContext(contextOptionsFor(market));
  await applyTrustedTraffic(context, market);
  try {
    const page = await context.newPage();
    const site = new BetssonSite(page, market);
    try {
      await site.login(creds);
    } catch (e) {
      // Local-only diagnostics (.cache/ is gitignored and never published): what the login page showed
      await page.screenshot({ path: `.cache/login-failure-${market.id}.png` }).catch(() => undefined);
      throw e;
    }
    return await context.storageState();
  } finally {
    await context.close();
  }
}
