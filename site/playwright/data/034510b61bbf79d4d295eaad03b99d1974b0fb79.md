# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: report-demo\failing-report.spec.ts >> DEMO informe — fallo provocado: el CRÉDITO leído tras la tirada tiene 1 € de menos
- Location: tests\report-demo\failing-report.spec.ts:33:5

# Error details

```
Error: No browser is listening on http://127.0.0.1:9222. This project runs only on Brave: open it with `npm run browser:fresh` (npm run all does it for you) and set CDP_URL=http://127.0.0.1:9222 in .env.
```

# Test source

```ts
  1  | import type { Browser, BrowserType } from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import path from 'node:path';
  4  | import type { AccountKind } from '../config/env';
  5  | import type { MarketId } from '../config/markets';
  6  | import type { StorageState } from './login';
  7  | 
  8  | /** Sessions saved by `npm run login` (manual login). Gitignored: they are as sensitive as a password. */
  9  | export const storageStatePath = (market: MarketId, account: AccountKind) => path.resolve('.auth', `${market}-${account}.json`);
  10 | 
  11 | /** DevTools endpoint of a browser opened by the player (`npm run browser`), e.g. http://127.0.0.1:9222. */
  12 | export const cdpUrl = () => process.env.CDP_URL?.trim() || undefined;
  13 | 
  14 | const BRAVE_ONLY =
  15 |   'This project runs only on Brave: open it with `npm run browser:fresh` (npm run all does it for you) and set ' +
  16 |   'CDP_URL=http://127.0.0.1:9222 in .env.';
  17 | 
  18 | /**
  19 |  * The ONLY way the checker gets a browser: attach over CDP to the Brave window opened by scripts/open-browser.cjs,
  20 |  * and verify it really is Brave (Brave exposes `navigator.brave`; Chrome and Playwright's Chromium do not).
  21 |  */
  22 | export async function connectBrave(chromium: BrowserType): Promise<Browser> {
  23 |   const cdp = cdpUrl();
  24 |   if (!cdp) throw new Error(`CDP_URL is not set. ${BRAVE_ONLY}`);
  25 |   let browser: Browser;
  26 |   try {
  27 |     browser = await chromium.connectOverCDP(cdp);
  28 |   } catch {
> 29 |     throw new Error(`No browser is listening on ${cdp}. ${BRAVE_ONLY}`);
     |           ^ Error: No browser is listening on http://127.0.0.1:9222. This project runs only on Brave: open it with `npm run browser:fresh` (npm run all does it for you) and set CDP_URL=http://127.0.0.1:9222 in .env.
  30 |   }
  31 |   const context = browser.contexts()[0];
  32 |   const probe = context.pages()[0] ?? (await context.newPage());
  33 |   const isBrave = await probe.evaluate(() => 'brave' in navigator).catch(() => false);
  34 |   if (!isBrave) {
  35 |     await browser.close();
  36 |     throw new Error(`The browser on ${cdp} is not Brave. ${BRAVE_ONLY}`);
  37 |   }
  38 |   return browser;
  39 | }
  40 | 
  41 | export function savedSession(market: MarketId, account: AccountKind): StorageState | undefined {
  42 |   const file = storageStatePath(market, account);
  43 |   if (!fs.existsSync(file)) return undefined;
  44 |   return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
  45 | }
  46 | 
```