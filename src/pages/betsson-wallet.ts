import type { BrowserContext, Page } from '@playwright/test';
import type { MarketConfig } from '../config/markets';
import { parseMoney, type Money } from '../utils/money';
import { sleep } from '../utils/text';

export interface WalletReading {
  money: Money;
  /** Screenshot of just the balance element (no personal data). */
  screenshot: Buffer;
  at: Date;
}

/**
 * Reads the Betsson balance from Betsson's header, in a second tab of the same session,
 * so the game tab is never navigated away. The game tab is brought back to front afterwards
 * (background tabs throttle canvas rendering).
 */
export class BetssonWallet {
  private tab?: Page;

  constructor(
    private context: BrowserContext,
    private gamePage: Page,
    private market: MarketConfig,
  ) {}

  async read(): Promise<WalletReading> {
    const tab = (this.tab ??= await this.context.newPage());
    try {
      await tab.goto(this.market.baseUrl + this.market.providerPath, { waitUntil: 'domcontentloaded' });
      const el = tab.locator(this.market.selectors.headerBalance).filter({ hasText: /\d/ }).first();
      await el.waitFor({ state: 'visible', timeout: 30_000 });
      let money: Money | null = null;
      for (let i = 0; i < 10 && !money; i++) {
        money = parseMoney(await el.innerText());
        if (!money) await sleep(1000);
      }
      if (!money) throw new Error(`Betsson balance not parseable: "${await el.innerText()}"`);
      return { money, screenshot: await el.screenshot(), at: new Date() };
    } finally {
      await this.gamePage.bringToFront();
    }
  }

  /** Polls the Betsson balance until it satisfies `ok` (wallet updates can lag the game) or the timeout expires. */
  async waitFor(ok: (m: Money) => boolean, timeoutMs = 45_000, intervalMs = 4000): Promise<{ reading: WalletReading; satisfied: boolean; polls: number }> {
    const start = Date.now();
    let polls = 0;
    let reading = await this.read();
    polls++;
    while (!ok(reading.money) && Date.now() - start < timeoutMs) {
      await sleep(intervalMs);
      reading = await this.read();
      polls++;
    }
    return { reading, satisfied: ok(reading.money), polls };
  }

  async close(): Promise<void> {
    await this.tab?.close().catch(() => undefined);
  }
}
