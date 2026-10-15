/**
 * Manual login — the player logs in by hand ONCE, the session is saved and the scenarios reuse it.
 *   npm run browser               opens Brave/Chrome with its own profile and DevTools port (keep it open)
 *   npm run login                 (funded account)
 *   ACCOUNT=empty npm run login   (insufficient-balance account)
 * With CDP_URL set (recommended) it attaches to that browser; otherwise it launches Google Chrome.
 * Nothing is typed by the automation and nothing is traced or recorded.
 * The session goes to .auth/<market>-<account>.json (gitignored, never published).
 */
import fs from 'node:fs';
import { chromium, selectors, test } from '@playwright/test';
import { contextOptionsFor } from '../src/auth/login';
import { cdpUrl, storageStatePath } from '../src/auth/session';
import { applyTrustedTraffic } from '../src/auth/trusted-traffic';
import type { AccountKind } from '../src/config/env';
import { getMarket, type MarketId } from '../src/config/markets';
import { BetssonSite } from '../src/pages/betsson-site';

// Plain @playwright/test (not ./fixtures): the fixtures would try an automated login first.
test('Manual login — save the session', async () => {
  const market = getMarket((process.env.MARKET ?? 'es') as MarketId);
  test.setTimeout(16 * 60_000);
  selectors.setTestIdAttribute('data-test-id');
  const account = (process.env.ACCOUNT ?? 'funded') as AccountKind;
  const cdp = cdpUrl();
  const browser = cdp
    ? await chromium.connectOverCDP(cdp)
    : await chromium.launch({ headless: false, channel: process.env.PW_CHANNEL || 'chrome' });
  try {
    // Over CDP: the browser's own profile (what the player sees); otherwise a fresh context.
    const context = cdp ? browser.contexts()[0] : await browser.newContext(contextOptionsFor(market));
    if (!cdp) await applyTrustedTraffic(context, market);
    const page = await context.newPage();
    const site = new BetssonSite(page, market);
    await site.open(market.loginPath);
    console.log(`\n>>> Log in by hand in the browser window with the ${account} account (15 minutes)...\n`);
    await site.waitForLoggedIn(15 * 60_000);
    await page.waitForTimeout(3000); // let the session cookies settle
    const file = storageStatePath(market.id, account);
    fs.mkdirSync('.auth', { recursive: true });
    fs.writeFileSync(file, JSON.stringify(await context.storageState(), null, 2));
    console.log(`>>> Session saved to ${file}`);
    if (cdp) await page.close();
  } finally {
    await browser.close(); // over CDP this only disconnects
  }
});
