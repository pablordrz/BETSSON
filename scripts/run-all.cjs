/**
 * Runs the real journeys on betsson.es in one go:   npm run all        (--no-spins to skip the spin series)
 *   1. Scenario 1 (funded account) in a FRESH Brave: login, game session, ONE real spin, balance check on exit
 *   2. Scenario 2 (account WITHOUT balance: the spin must be blocked) in another FRESH Brave,
 *      so it never reuses the first account's session (skipped when EMPTY_USER/PASS are not set)
 *   3. Spin series in a FRESH Brave: SPINS real spins (default 5) at the minimum wager, never above MAX_BET
 *      (default 0.10), then the balance on the page must equal the last in-game CREDIT
 *   4. one merged report: site/index.html (checks) + site/playwright/index.html (traces, screenshots)
 * Needs .env with FUNDED_USER/PASS (EMPTY_USER/PASS for scenario 2) and CDP_URL. ⚠ Real money: 1 + SPINS spins.
 * Offline checks (typecheck, unit tests) are separate: npm run typecheck · npm run unit.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const withSpins = !process.argv.includes('--no-spins');
const blobDir = path.resolve('all-blob-reports');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;
const results = [];

const run = (title, cmd, args, env = {}) => {
  const start = Date.now();
  console.log(`\n━━━ ${title} ━━━`);
  // Only npx.cmd needs a shell on Windows; node is run directly (its path, "C:\Program Files\...", has a space
  // that cmd.exe would split on)
  const shell = process.platform === 'win32' && cmd === npx;
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell });
  const ok = r.status === 0;
  results.push({ title, ok, seconds: Math.round((Date.now() - start) / 1000) });
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

  run('Merged report', npx, ['playwright', 'merge-reports', '--config', 'merge.config.ts', blobDir]);

  console.log('\n━━━ Summary ━━━');
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.title}  (${r.seconds}s)`);
  console.log(`Total ${Math.round((Date.now() - t0) / 1000)}s · report: ${path.resolve('site', 'index.html')}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
