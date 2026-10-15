import { expect, type TestInfo } from '@playwright/test';
import type { MarketConfig } from '../config/markets';

export type CheckStatus = 'PASS' | 'FAIL' | 'INFO';

export interface CheckRecord {
  scenario: string;
  market: string;
  id: string;
  title: string;
  status: CheckStatus;
  expected: string;
  actual: string;
  note?: string;
  evidence?: string[];
}

export const CHECK_ATTACHMENT = 'check';

/**
 * Records every verification as a row of the pass/fail report (one attachment per check, picked up by
 * src/reporter/checks-reporter.ts). FAIL rows are soft assertions: the run continues so the report
 * shows every check, and the Playwright test still ends as failed.
 */
export class Checks {
  readonly records: CheckRecord[] = [];

  constructor(
    private testInfo: TestInfo,
    private market: MarketConfig,
    private scenario: string,
  ) {}

  async check(
    id: string,
    title: string,
    pass: boolean,
    expected: string,
    actual: string,
    opts: { note?: string; evidence?: string[] } = {},
  ): Promise<boolean> {
    await this.add({ id, title, status: pass ? 'PASS' : 'FAIL', expected, actual, ...opts });
    expect.soft(pass, `[${this.market.site}] ${id} — ${title}\n  expected: ${expected}\n  actual:   ${actual}`).toBe(true);
    return pass;
  }

  /** Informational row: shown in the report, never fails the test (cross-checks, observations). */
  async info(id: string, title: string, expected: string, actual: string, opts: { note?: string; evidence?: string[] } = {}) {
    await this.add({ id, title, status: 'INFO', expected, actual, ...opts });
  }

  async image(name: string, png: Buffer): Promise<string> {
    await this.testInfo.attach(name, { body: png, contentType: 'image/png' });
    return name;
  }

  async json(name: string, data: unknown): Promise<void> {
    await this.testInfo.attach(name, { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
  }

  private async add(r: Omit<CheckRecord, 'scenario' | 'market'>) {
    const rec: CheckRecord = { scenario: this.scenario, market: this.market.site, ...r };
    this.records.push(rec);
    await this.testInfo.attach(CHECK_ATTACHMENT, { body: JSON.stringify(rec), contentType: 'application/json' });
  }
}
