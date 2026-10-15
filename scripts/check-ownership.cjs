/**
 * Checks that a branch only touches the files its owner may edit (see docs/WORK-SPLIT.md).
 *   node scripts/check-ownership.cjs A        (A | B | C | D)
 * Compares the branch with origin/main (or main). Exit code 1 if any file is outside the owner's paths.
 */
const { execSync } = require('node:child_process');

/** Single source of truth for file ownership. Keep in sync with docs/WORK-SPLIT.md. */
const OWNERS = {
  A: [
    'README.md',
    'docs/why-typescript.md',
    'docs/code-philosophy.md',
    'docs/qa-approach.md',
    'docs/presentation-outline.md',
    'docs/presentation/**',
    'docs/WORK-SPLIT.md',
    'docs/ai-briefs/**',
    // balance validations without spending money (zero-balance account, game vs header balance)
    'src/steps/balance.steps.ts',
    'src/pages/header-balance.ts',
    'tests/balance/**',
    'tests/unit/balance.spec.ts',
    'tests/unit/fixtures/balance/**',
    'docs/balance-validation.md',
  ],
  B: [
    'docs/vision-approaches.md',
    'src/vision/controls/**',
    'src/vision/template.ts',
    'assets/templates/**',
    'scripts/bench-vision*',
    'tests/unit/vision-approaches.spec.ts',
    'tests/unit/fixtures/vision/**',
  ],
  C: [
    'src/steps/runner.ts',
    'src/utils/checks.ts',
    'src/reporter/**',
    'merge.config.ts',
    'playwright.config.ts',
    'tests/fixtures.ts',
    'tests/unit/steps.spec.ts',
    'tests/unit/reporter.spec.ts',
    'tests/unit/isolation.spec.ts',
    'docs/reports-and-logs.md',
    'docs/test-isolation.md',
    '.gitignore',
    'ci/**',
    '.github/**',
  ],
  D: [
    'tests/demo/**',
    'scripts/open-browser.cjs',
    'scripts/demo*',
    'scripts/run-all*',
    'package.json',
    'package-lock.json',
    'src/vision/settle.ts',
    'src/vision/motion.ts',
    'src/vision/bet.ts',
    'src/vision/hud.ts',
    'src/vision/ocr.ts',
    'src/vision/game-screen.ts',
    'src/pages/betsson-site.ts',
    'src/pages/betsson-wallet.ts',
    '.env.example',
    'docs/demo-runbook.md',
    'tests/unit/fixtures/demo/**',
  ],
};

const toRegex = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*')}$`,
  );

const who = (process.argv[2] || '').toUpperCase();
if (!OWNERS[who]) {
  console.error('Usage: node scripts/check-ownership.cjs <A|B|C|D>');
  process.exit(2);
}

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let base = 'origin/main';
try {
  git('rev-parse --verify origin/main');
} catch {
  base = 'main';
}
const changed = [
  ...git(`diff --name-only ${base}...HEAD`).split('\n'),
  ...git('diff --name-only').split('\n'), // uncommitted changes too
  ...git('ls-files --others --exclude-standard').split('\n'),
].filter(Boolean);

const mine = OWNERS[who].map(toRegex);
const ownerOf = (file) => Object.keys(OWNERS).find((o) => OWNERS[o].map(toRegex).some((re) => re.test(file))) ?? 'FROZEN / nobody';
const outside = [...new Set(changed)].filter((f) => !mine.some((re) => re.test(f)));

if (!outside.length) {
  console.log(`OK: person ${who} only touched their own files (${new Set(changed).size} changed vs ${base}).`);
  process.exit(0);
}
console.error(`NOT OK: person ${who} touched files that are not theirs:`);
for (const f of outside) console.error(`  ${f}   → owner: ${ownerOf(f)}`);
console.error('Undo those changes (git checkout origin/main -- <file>) and ask the owner in a separate small PR.');
process.exit(1);
