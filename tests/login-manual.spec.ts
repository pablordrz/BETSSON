/**
 * Manual login — the player logs in by hand ONCE, the session is saved and the scenarios reuse it.
 *   npm run browser               opens Brave with its own profile and DevTools port (keep it open)
 *   npm run login                 (funded account)
 *   ACCOUNT=empty npm run login   (insufficient-balance account)
 * Brave only: it attaches to that Brave window (CDP_URL) and checks it is Brave.
 * Nothing is typed by the automation and nothing is traced or recorded.
 * The session goes to .auth/<market>-<account>.json (gitignored, never published).
 */
import fs from 'node:fs';
import { chromium, selectors, test } from '@playwright/test';
import { connectBrave, storageStatePath } from '../src/auth/session';
import type { AccountKind } from '../src/config/env';
import { getMarket, type MarketId } from '../src/config/markets';
import { BetssonSite } from '../src/pages/betsson-site';

// Plain @playwright/test (not ./fixtures): the fixtures would try an automated login first.
test('Manual login — save the session', async () => {
  const market = getMarket((process.env.MARKET ?? 'es') as MarketId);
  test.setTimeout(16 * 60_000);
  selectors.setTestIdAttribute('data-test-id');
  const account = (process.env.ACCOUNT ?? 'funded') as AccountKind;
  // Brave only: the player's own Brave window (npm run browser), its own profile
  const browser = await connectBrave(chromium);
  try {
    const context = browser.contexts()[0];
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
    await page.close();
  } finally {
    await browser.close(); // over CDP this only disconnects
  }
});
