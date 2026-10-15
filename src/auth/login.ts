import type { Browser, BrowserContextOptions } from '@playwright/test';
import { proxyFor, type Credentials } from '../config/env';
import type { MarketConfig } from '../config/markets';
import { BetssonSite } from '../pages/betsson-site';

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
  const context = await browser.newContext(contextOptionsFor(market));
  try {
    const page = await context.newPage();
    const site = new BetssonSite(page, market);
    await site.login(creds);
    return await context.storageState();
  } finally {
    await context.close();
  }
}
