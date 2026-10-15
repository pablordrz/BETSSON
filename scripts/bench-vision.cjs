/**
 * Offline benchmark of the vision approaches on real frames (no browser, no money):
 *   node scripts/bench-vision.cjs
 * Prints: spin-button detection (template ZNCC vs Hough vs segmentation), HUD OCR variants, frame-difference levels.
 */
const { spawnSync } = require('node:child_process');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(npx, ['playwright', 'test', '--project=unit', 'tests/unit/vision-approaches.spec.ts', '--reporter=list', '--workers=1'], {
  stdio: 'inherit',
  env: { ...process.env, BENCH: '1' },
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
