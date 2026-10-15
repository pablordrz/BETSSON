/**
 * Runs the real journeys on betsson.es in one go:   npm run all        (--no-spins to skip the spin series)
 *   1. Scenario 1 (funded account) in a FRESH Brave: login, game session, ONE real spin, balance check on exit
 *   2. Scenario 2 (account WITHOUT balance: the spin must be blocked) in another FRESH Brave,
 *      so it never reuses the first account's session (skipped when EMPTY_USER/PASS are not set)
 *   3. Spin series in a FRESH Brave: SPINS real spins (default 5) at the minimum wager, never above MAX_BET
 *      (default 0.10), then the balance on the page must equal the last in-game CREDIT
 *   4. RAISE THE WAGER in a FRESH Brave: from the minimum, press "+" BET_STEPS times (default 1, never above BET_MAX,
 *      default 0.50 €), spin ONCE at the raised wager, check it is the wager charged and that the in-game and Betsson
 *      balances reconcile, then back to the minimum (--no-bet-raise to skip it)
 *   5. REPORT DEMO in a FRESH Brave: a test that FAILS ON PURPOSE (one real spin, then the CREDIT read is altered by
 *      −1 €) to show what a failure looks like in the report. Its failure is EXPECTED: shown as such in the summary
 *      and NOT counted in the exit code (--no-report-demo to skip it)
 *   6. one merged report: site/index.html (checks) + site/playwright/index.html (traces, screenshots)
 * Needs .env with FUNDED_USER/PASS (EMPTY_USER/PASS for scenario 2) and CDP_URL.
 * ⚠ Real money: 1 (scenario 1) + SPINS (series, default 5) + 1 at the raised wager + 1 (report demo) spins.
 * Offline checks (typecheck, unit tests) are separate: npm run typecheck · npm run unit.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const withSpins = !process.argv.includes('--no-spins');
const withBetRaise = !process.argv.includes('--no-bet-raise');
const withReportDemo = !process.argv.includes('--no-report-demo');
const blobDir = path.resolve('all-blob-reports');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;
const results = [];

/** `expectFailure`: the step is SUPPOSED to fail (report demo): ok when it fails, and labelled as such. */
const run = (title, cmd, args, env = {}, { expectFailure = false } = {}) => {
  const start = Date.now();
  console.log(`\n━━━ ${title} ━━━`);
  // Only npx.cmd needs a shell on Windows; node is run directly (its path, "C:\Program Files\...", has a space
  // that cmd.exe would split on)
  const shell = process.platform === 'win32' && cmd === npx;
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell });
  const ok = expectFailure ? r.status !== 0 : r.status === 0;
  const note = expectFailure ? (ok ? ' — fallo provocado, ESPERADO' : ' — debería haber fallado y NO falló') : '';
  results.push({ title: `${title}${note}`, ok, seconds: Math.round((Date.now() - start) / 1000) });
  return ok;
};

const freshBrave = async () => {
  run('Fresh Brave (empty profile)', node, ['scripts/open-browser.cjs', '--fresh']);
  const port = Number(new URL(process.env.CDP_URL || 'http://127.0.0.1:9222').port || 9222);
  for (let i = 0; i < 40; i++) {
    if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Brave did not open its DevTools port');
};

const scenario = (title, spec, blobName) =>
  run(title, npx, ['playwright', 'test', '--project=betsson.es', spec, '--reporter=list,blob'], {
    PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir,
    PLAYWRIGHT_BLOB_OUTPUT_NAME: blobName,
  });

(async () => {
  const t0 = Date.now();
  fs.rmSync(blobDir, { recursive: true, force: true });

  await freshBrave();
  scenario('Scenario 1 — completed Real Play spin (funded account)', 'tests/scenarios/scenario1-real-play-spin.spec.ts', 'scenario1.zip');

  await freshBrave(); // new profile → the empty account logs in from scratch
  scenario('Scenario 2 — insufficient balance (account without balance)', 'tests/scenarios/scenario2-insufficient-balance.spec.ts', 'scenario2.zip');

  if (withSpins) {
    await freshBrave();
    run('Spin series', npx, ['playwright', 'test', '--project=series-betsson.es', '--reporter=list,blob'], {
      PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir,
      PLAYWRIGHT_BLOB_OUTPUT_NAME: 'series.zip',
      SPINS: process.env.SPINS ?? '5',
      MAX_BET: process.env.MAX_BET ?? '0.10',
    });
  }

  if (withBetRaise) {
    await freshBrave();
    run('Raise the wager with "+" and spin once at it', npx, ['playwright', 'test', '--project=bet-betsson.es', '--reporter=list,blob'], {
      PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir,
      PLAYWRIGHT_BLOB_OUTPUT_NAME: 'bet-raise.zip',
      BET_STEPS: process.env.BET_STEPS ?? '1',
      MAX_BET: process.env.BET_MAX ?? '0.50', // cap for the raised wager (the series keeps its own 0.10 cap)
    });
  }

  if (withReportDemo) {
    await freshBrave();
    run(
      'Report demo — test that fails ON PURPOSE (CREDIT read altered by −1 €)',
      npx,
      ['playwright', 'test', '--project=report-demo-betsson.es', '--reporter=list,blob'],
      { PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir, PLAYWRIGHT_BLOB_OUTPUT_NAME: 'report-demo.zip' },
      { expectFailure: true },
    );
  }

  run('Merged report', npx, ['playwright', 'merge-reports', '--config', 'merge.config.ts', blobDir]);

  console.log('\n━━━ Summary ━━━');
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.title}  (${r.seconds}s)`);
  console.log(`Total ${Math.round((Date.now() - t0) / 1000)}s · report: ${path.resolve('site', 'index.html')}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
