import type { Browser, BrowserType } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountKind } from '../config/env';
import type { MarketId } from '../config/markets';
import type { StorageState } from './login';

/** Sessions saved by `npm run login` (manual login). Gitignored: they are as sensitive as a password. */
export const storageStatePath = (market: MarketId, account: AccountKind) => path.resolve('.auth', `${market}-${account}.json`);

/** DevTools endpoint of a browser opened by the player (`npm run browser`), e.g. http://127.0.0.1:9222. */
export const cdpUrl = () => process.env.CDP_URL?.trim() || undefined;

const BRAVE_ONLY =
  'This project runs only on Brave: open it with `npm run browser:fresh` (npm run all does it for you) and set ' +
  'CDP_URL=http://127.0.0.1:9222 in .env.';

/**
 * The ONLY way the checker gets a browser: attach over CDP to the Brave window opened by scripts/open-browser.cjs,
 * and verify it really is Brave (Brave exposes `navigator.brave`; Chrome and Playwright's Chromium do not).
 */
export async function connectBrave(chromium: BrowserType): Promise<Browser> {
  const cdp = cdpUrl();
  if (!cdp) throw new Error(`CDP_URL is not set. ${BRAVE_ONLY}`);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(cdp);
  } catch {
    throw new Error(`No browser is listening on ${cdp}. ${BRAVE_ONLY}`);
  }
  const context = browser.contexts()[0];
  const probe = context.pages()[0] ?? (await context.newPage());
  const isBrave = await probe.evaluate(() => 'brave' in navigator).catch(() => false);
  if (!isBrave) {
    await browser.close();
    throw new Error(`The browser on ${cdp} is not Brave. ${BRAVE_ONLY}`);
  }
  return browser;
}

export function savedSession(market: MarketId, account: AccountKind): StorageState | undefined {
  const file = storageStatePath(market, account);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
}
