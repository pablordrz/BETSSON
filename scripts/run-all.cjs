/**
 * Runs EVERYTHING in one go:   npm run all            (add --spins to also run the spin series)
 *   1. typecheck + offline unit tests (stops here if they fail)
 *   2. Scenario 1 (funded account) in a FRESH Brave
 *   3. Scenario 2 (account WITHOUT balance: the spin must be blocked) in another FRESH Brave,
 *      so it never reuses the first account's session
 *   4. one merged report: site/index.html (checks) + site/playwright/index.html (traces, screenshots)
 * Needs .env with FUNDED_USER/PASS, EMPTY_USER/PASS and CDP_URL. ⚠ Scenario 1 makes ONE real spin (minimum wager).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const withSpins = process.argv.includes('--spins');
const blobDir = path.resolve('all-blob-reports');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;
const results = [];

const run = (title, cmd, args, env = {}) => {
  const start = Date.now();
  console.log(`\n━━━ ${title} ━━━`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
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

  if (!run('Typecheck', npx, ['tsc', '--noEmit']) || !run('Unit tests (offline)', npx, ['playwright', 'test', '--project=unit'])) {
    console.error('\nOffline checks failed: not running anything with real money.');
    process.exit(1);
  }

  await freshBrave();
  scenario('Scenario 1 — completed Real Play spin (funded account)', 'tests/scenarios/scenario1-real-play-spin.spec.ts', 'scenario1.zip');

  await freshBrave(); // new profile → the empty account logs in from scratch
  scenario('Scenario 2 — insufficient balance (account without balance)', 'tests/scenarios/scenario2-insufficient-balance.spec.ts', 'scenario2.zip');

  if (withSpins) {
    await freshBrave();
    run('Spin series', npx, ['playwright', 'test', '--project=series-betsson.es', '--reporter=list,blob'], {
      PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir,
      PLAYWRIGHT_BLOB_OUTPUT_NAME: 'series.zip',
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
