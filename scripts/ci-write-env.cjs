/**
 * CI only: writes .env for the live job from GitHub secrets/vars (environment variables), never printing them.
 *   node scripts/ci-write-env.cjs          → writes .env
 *   node scripts/ci-write-env.cjs --remove → deletes it (always run at the end of the job)
 */
const fs = require('node:fs');

if (process.argv.includes('--remove')) {
  fs.rmSync('.env', { force: true });
  console.log('.env removed');
  process.exit(0);
}
const e = process.env;
const lines = ['FUNDED_USER', 'FUNDED_PASS', 'EMPTY_USER', 'EMPTY_PASS', 'EXTRA_HTTP_HEADERS']
  .filter((k) => e[k])
  .map((k) => `${k}=${e[k]}`);
lines.push(`CDP_URL=${e.CDP_URL || 'http://127.0.0.1:9222'}`, `GAME_SLUG=${e.GAME_SLUG || 'triple-hop-pots'}`);
fs.writeFileSync('.env', lines.join('\n') + '\n');
const missing = ['FUNDED_USER', 'FUNDED_PASS'].filter((k) => !e[k]);
console.log(`.env written (${lines.length} keys)${missing.length ? ` — MISSING secrets: ${missing.join(', ')}` : ''}${e.EMPTY_USER ? '' : ' — no EMPTY_USER: scenario 2 will be skipped'}`);
if (missing.length) process.exit(1);
