/**
 * Offline tests of the step runner contract (no browser): soft failures, fault isolation, retries only for
 * retryable steps, and a log entry per event.
 */
import { expect, test, type TestInfo } from '@playwright/test';
import { defineStep, StepRunner, type StepContext } from '../../src/steps';
import type { Checks } from '../../src/utils/checks';

/** Report rows are not under test here (the real Checks makes FAIL rows soft-fail the test on purpose). */
const fakeChecks = { check: async (_id: string, _t: string, pass: boolean) => pass, image: async (name: string) => name } as unknown as Checks;
const runnerFor = (testInfo: TestInfo) => new StepRunner({} as Omit<StepContext, 'log'>, fakeChecks, testInfo, { quiet: true, retries: 2 });

test.describe('step runner', () => {
  test('passes data from one step to the next', async ({}, testInfo) => {
    const runner = runnerFor(testInfo);
    const double = defineStep<{ n: number }, { n: number }>({ id: 't.double', title: 'double', async run(_c, { n }) { return { ok: true, detail: 'ok', data: { n: n * 2 } }; } });
    const r = await runner.must(double, { n: 21 });
    expect(r.data.n).toBe(42);
    expect(runner.entries.map((e) => e.event)).toEqual(['start', 'pass']);
  });

  test('an exception becomes a FAIL result (fault isolation), and must() stops the journey', async ({}, testInfo) => {
    const runner = runnerFor(testInfo);
    const boom = defineStep<void, never>({ id: 't.boom', title: 'boom', async run() { throw new Error('OCR exploded'); } });
    const r = await runner.run(boom);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('OCR exploded');
    await expect(runner.must(boom)).rejects.toThrow(/Required step t\.boom failed/);
  });

  test('retryable steps are retried; money-moving steps never are', async ({}, testInfo) => {
    const runner = runnerFor(testInfo);
    let reads = 0;
    const flakyRead = defineStep<void, number>({ id: 't.read', title: 'read', retryable: true, async run() { reads++; return reads < 3 ? { ok: false, detail: 'misread' } : { ok: true, detail: 'ok', data: reads }; } });
    expect((await runner.run(flakyRead)).ok).toBe(true);
    expect(reads).toBe(3);

    let spins = 0;
    const spinOnce = defineStep<void, number>({ id: 't.spin', title: 'spin', retryable: false, async run() { spins++; return { ok: false, detail: 'no reaction' }; } });
    await runner.run(spinOnce);
    expect(spins).toBe(1);
  });
});
