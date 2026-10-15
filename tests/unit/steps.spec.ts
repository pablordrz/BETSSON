/**
 * Offline tests of the step runner contract (no browser): soft failures, fault isolation, retries only for
 * retryable steps, and a log entry per event.
 */
import { expect, test, type TestInfo } from '@playwright/test';
import { explain } from '../../src/reporter/explain';
import { loadRequirements, must, requirementSetsFor, requirementsFor } from '../../src/reporter/step-requirements';
import * as catalogue from '../../src/steps';
import { defineStep, StepRunner, type Step, type StepContext } from '../../src/steps';
import type { CheckExtras, Checks } from '../../src/utils/checks';

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

/** Records the report rows and screenshots the runner produces. */
function recordingChecks() {
  const rows: Array<{ id: string; title: string; pass: boolean; expected: string; actual: string } & CheckExtras> = [];
  const images: string[] = [];
  const checks = {
    check: async (id: string, title: string, pass: boolean, expected: string, actual: string, opts: CheckExtras = {}) => {
      rows.push({ id, title, pass, expected, actual, ...opts });
      return pass;
    },
    image: async (name: string) => {
      images.push(name);
      return name;
    },
  } as unknown as Checks;
  return { checks, rows, images };
}

const png = Buffer.from('fake');

test.describe('step requirements', () => {
  test('a passing step is only counted: no screenshot, no why, no log', async ({}, testInfo) => {
    const { checks, rows, images } = recordingChecks();
    const runner = new StepRunner({} as Omit<StepContext, 'log'>, checks, testInfo, { quiet: true });
    const ok = defineStep<void, { n: number }>({ id: 't.ok', title: 'ok', async run({ log }) { log('read 1'); return { ok: true, detail: 'fine', data: { n: 1 }, evidence: [{ name: 'shot', png }] }; } });
    await runner.run(ok);
    expect(images).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pass && !r.evidence && !r.why && !r.log)).toBe(true);
  });

  test('a failing step gets its screenshot, the step log and a readable why', async ({}, testInfo) => {
    const { checks, rows, images } = recordingChecks();
    const runner = new StepRunner({} as Omit<StepContext, 'log'>, checks, testInfo, { quiet: true });
    const bad = defineStep<void, never>({ id: 't.bad', title: 'reads the HUD', async run({ log }) { log('OCR text', { text: 'CRÉDITO ?' }); return { ok: false, detail: 'HUD not readable · OCR: "?"', evidence: [{ name: 'hud', png }] }; } });
    await runner.run(bad);
    const failed = rows.filter((r) => !r.pass);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ title: 'Valida en pantalla lo que promete', expected: 'reads the HUD', step: 't.bad', evidence: ['t.bad · hud'] });
    expect(failed[0].why).toContain('OCR no pudo leer');
    expect(failed[0].log?.[0]).toContain('OCR text');
    expect(images).toEqual(['t.bad · hud']);
  });

  test('an exception blocks the other requirements and explains what Playwright waited for', async ({}, testInfo) => {
    const { checks, rows } = recordingChecks();
    const runner = new StepRunner({} as Omit<StepContext, 'log'>, checks, testInfo, { quiet: true });
    const boom = defineStep<void, never>({
      id: 't.boom',
      title: 'opens the game',
      async run() {
        throw new Error("locator.click: Timeout 20000ms exceeded.\nCall log:\n  - waiting for getByTestId('play-for-real').first()\n");
      },
    });
    await runner.run(boom);
    const failed = rows.filter((r) => !r.pass);
    expect(failed.map((r) => r.title)).toEqual(['El paso termina sin errores']);
    expect(failed[0].why).toBe('«play-for-real» (data-test-id) no apareció en pantalla en 20 s');
    expect(failed[0].note).toMatch(/no evaluado/);
  });

  test('a specific requirement replaces the generic "validates on screen" card', async ({}, testInfo) => {
    const { checks, rows } = recordingChecks();
    const step = defineStep<void, { currency: string }>({ id: 't.hud', title: 'HUD in EUR', async run() { return { ok: false, detail: 'currency ≠ EUR', data: { currency: 'USD' } }; } });
    const own = requirementsFor(step, [must('Moneda EUR', (r) => r.data.currency === 'EUR', (r) => `leído: ${r.data.currency}`)]);
    const runner = new StepRunner({} as Omit<StepContext, 'log'>, checks, testInfo, { quiet: true, requirements: (id) => requirementSetsFor(id, [...loadRequirements(), own]) });
    await runner.run(step);
    const failed = rows.filter((r) => !r.pass);
    expect(failed.map((r) => [r.title, r.actual])).toEqual([['Moneda EUR', 'leído: USD']]);
  });

  test('every requirement file loads and points to a step that exists', async () => {
    const ids = new Set((Object.values(catalogue) as unknown[]).filter((s): s is Step<unknown, unknown> => !!s && typeof s === 'object' && 'id' in s && 'run' in s).map((s) => s.id));
    const sets = loadRequirements();
    expect(sets.some((s) => s.stepId === '*')).toBe(true);
    for (const s of sets) expect(s.stepId === '*' || ids.has(s.stepId), `${s.source} → unknown step "${s.stepId}"`).toBe(true);
  });
});

test.describe('explain', () => {
  test('turns raw errors into a readable why', () => {
    expect(explain("Timeout 6000ms exceeded.\nCall log:\n  - waiting for locator('#onetrust-banner-sdk') to be visible")).toBe('«#onetrust-banner-sdk» no apareció en pantalla en 6 s');
    expect(explain('Betsson rejected the login: "Actualiza la página"')).toBe('Betsson rechazó el login: «Actualiza la página»');
    expect(explain('something nobody described yet')).toBeUndefined();
  });
});
