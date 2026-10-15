import type { Page } from '@playwright/test';
import { parseAmount } from './money';

export interface ProviderEvent {
  at: number;
  url: string;
  balance: number | null;
  totalWin: number | null;
  fields: Record<string, string>;
}

/**
 * BONUS cross-check (never the proof): passively records what the provider's game server answered,
 * so the report can show that what we READ on screen matches what the server said.
 * Pragmatic Play's HTML5 client talks to `.../gameService` with url-encoded key=value bodies
 * (e.g. `balance=…&tw=…`). Field names may differ per game — this only reports, never fails a test.
 */
export class ProviderTap {
  readonly events: ProviderEvent[] = [];

  constructor(page: Page, urlRe = /gameService|gs2c\/v\d|ge\/v\d/i) {
    page.on('response', async (res) => {
      if (!urlRe.test(res.url())) return;
      const body = await res.text().catch(() => '');
      if (!body.includes('balance')) return;
      const fields: Record<string, string> = {};
      try {
        for (const [k, v] of new URLSearchParams(body)) fields[k] = v;
      } catch {
        return;
      }
      this.events.push({
        at: Date.now(),
        url: res.url().split('?')[0],
        balance: fields.balance ? parseAmount(fields.balance) : null,
        totalWin: fields.tw ? parseAmount(fields.tw) : null,
        fields,
      });
    });
  }

  lastSince(ts: number): ProviderEvent | undefined {
    return [...this.events].reverse().find((e) => e.at >= ts && e.balance !== null);
  }
}
