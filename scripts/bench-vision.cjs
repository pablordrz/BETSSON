/**
 * Offline benchmark of the vision approaches on real frames (no browser, no money):
 *   node scripts/bench-vision.cjs
 * 1. runs the benchmark → prints the tables and writes docs/vision-approaches/results.json
 * 2. draws the charts with matplotlib → docs/vision-approaches/*.png
 * Python: set PYTHON, or it uses .cache/venv-vision (python -m venv .cache/venv-vision &&
 *   .cache/venv-vision/Scripts/pip install -r scripts/bench-vision-requirements.txt), else `python`.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const win = process.platform === 'win32';
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: win }).status ?? 1;

const status = run(win ? 'npx.cmd' : 'npx', ['playwright', 'test', '--project=unit', 'tests/unit/vision-approaches.spec.ts', '--reporter=list', '--workers=1'], {
  BENCH: '1',
});
if (status !== 0) process.exit(status);

const venv = path.resolve('.cache', 'venv-vision', win ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON || (fs.existsSync(venv) ? venv : 'python');
console.log(`\nDrawing charts with ${python}`);
process.exit(run(python, ['scripts/bench-vision-charts.py']));
