/**
 * Offline tests of the failures-only report: only FAIL rows become cards (with screenshot, why and log),
 * passing checks are only counted, and checks.json keeps every row.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import ChecksReporter from '../../src/reporter/checks-reporter';
import type { CheckRecord } from '../../src/utils/checks';

/** A real game frame, so the sample report this test leaves in test-results/ looks like a real one. */
const frame = fs.readFileSync(path.join(__dirname, 'fixtures', 'pragmatic-triple-hop-pots.png'));
const row = (r: Partial<CheckRecord>): CheckRecord => ({ scenario: 'Scenario 1', market: 'betsson.es', id: 'x', title: 'x', status: 'PASS', expected: '', actual: '', ...r });
const json = (r: CheckRecord) => ({ name: 'check', contentType: 'application/json', body: Buffer.from(JSON.stringify(r)) });
const testCase = (project: string, title = 'Scenario 1') => ({ id: 't1', title, annotations: [], parent: { project: () => ({ name: project }) } }) as unknown as TestCase;
const result = (attachments: TestResult['attachments'], status: TestResult['status'] = 'failed', errors: Array<{ message: string }> = []) => ({ status, attachments, errors }) as unknown as TestResult;

async function render(dir: string, tc: TestCase, res: TestResult) {
  const reporter = new ChecksReporter({ outputDir: dir });
  reporter.onTestEnd(tc, res);
  await reporter.onEnd({ status: 'failed' } as FullResult);
  return { html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), json: JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')) };
}

test.describe('failures-only report', () => {
  test('one card per failure with screenshot, why and log; passes only counted', async ({}, testInfo) => {
    const dir = testInfo.outputPath('report');
    const fail = row({ id: 'game.readHud#4', step: 'game.readHud', title: 'CRÉDITO en la moneda del mercado', status: 'FAIL', expected: 'EUR', actual: 'CRÉDITO leído: 107,22 ?', why: 'la moneda leída no es EUR', log: ['14:02:11 · HUD read'], evidence: ['game.readHud · hud'] });
    const { html, json: data } = await render(
      dir,
      testCase('betsson.es'),
      result([json(row({ title: 'Paso que fue bien' })), json(row({ title: 'Otro paso que fue bien' })), json(fail), { name: 'game.readHud · hud', contentType: 'image/png', body: frame }]),
    );
    expect(html).toContain('✗ 1 fallo');
    expect(html).toContain('CRÉDITO en la moneda del mercado');
    expect(html).toContain('la moneda leída no es EUR');
    expect(html).toContain('14:02:11 · HUD read');
    expect(html).toMatch(/<img src="evidence\/1-game\.readHud_hud\.png"/);
    expect(fs.existsSync(path.join(dir, 'evidence', '1-game.readHud_hud.png'))).toBe(true);
    expect(html).toContain('✓ 2 comprobaciones correctas');
    expect(html).not.toContain('Paso que fue bien'); // passes are never listed
    expect(data.rows).toHaveLength(3); // …but checks.json keeps them all
  });

  test('all green: a single verdict line and the count', async ({}, testInfo) => {
    const { html } = await render(testInfo.outputPath('report'), testCase('betsson.es'), result([json(row({})), json(row({}))], 'passed'));
    expect(html).toContain('✓ Todo correcto');
    expect(html).not.toContain('class="card"');
    expect(html).toContain('✓ 2 comprobaciones correctas');
  });

  test('a scenario that aborts without a failing check still gets a card explaining why', async ({}, testInfo) => {
    const { html } = await render(
      testInfo.outputPath('report'),
      testCase('betsson.es'),
      result([], 'failed', [{ message: "TimeoutError: locator.click: Timeout 20000ms exceeded.\nCall log:\n  - waiting for getByTestId('play-for-real').first()" }]),
    );
    expect(html).toContain('El escenario llega hasta el final');
    expect(html).toContain('«play-for-real» (data-test-id) no apareció en pantalla en 20 s');
  });

  test('unit and calibration runs do not overwrite the last real report', async ({}, testInfo) => {
    const dir = testInfo.outputPath('report');
    const reporter = new ChecksReporter({ outputDir: dir });
    reporter.onTestEnd(testCase('unit'), result([json(row({ status: 'FAIL' }))]));
    await reporter.onEnd({ status: 'passed' } as FullResult);
    expect(fs.existsSync(path.join(dir, 'index.html'))).toBe(false);
  });
});
