/**
 * Markdown summary for the GitHub Actions run page (GITHUB_STEP_SUMMARY), built ONLY from files the run produced:
 *   node scripts/ci-summary.cjs offline   → typecheck/unit results (out/unit.json) + vision benchmark (results.json)
 *   node scripts/ci-summary.cjs live      → live journeys (site/checks.json from `npm run all`)
 * Without GITHUB_STEP_SUMMARY it prints to stdout.
 */
const fs = require('node:fs');
const path = require('node:path');

const mode = process.argv[2];
const out = [];
const md = (line = '') => out.push(line);
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : undefined);
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

if (mode === 'offline') {
  // ── unit tests (Playwright JSON reporter) ────────────────────────────────────────────────────────────────────
  const unit = read('out/unit.json');
  md('## ✅ Offline proof — runs on every push (no browser, no money)');
  md();
  if (unit) {
    const s = unit.stats ?? {};
    const files = new Map();
    const walk = (suite, file) => {
      const f = suite.file ?? file;
      for (const spec of suite.specs ?? []) {
        const row = files.get(f) ?? { passed: 0, failed: 0, skipped: 0, titles: [] };
        for (const t of spec.tests ?? []) {
          const st = t.status; // expected | unexpected | skipped | flaky
          if (st === 'skipped') row.skipped++;
          else if (st === 'expected' || st === 'flaky') row.passed++;
          else row.failed++;
        }
        row.titles.push(spec.title);
        files.set(f, row);
      }
      for (const child of suite.suites ?? []) walk(child, f);
    };
    for (const suite of unit.suites ?? []) walk(suite, suite.file);
    md(`**Unit tests: ${s.expected ?? 0} passed · ${s.unexpected ?? 0} failed · ${s.skipped ?? 0} skipped** (${((s.duration ?? 0) / 1000).toFixed(0)} s)`);
    md();
    md('| Test file | What it proves | Passed | Failed |');
    md('|---|---|---|---|');
    const what = {
      'vision.spec.ts': 'money parsing, HUD OCR on a real game frame, template matching, spin/bet buttons on real frames',
      'vision-approaches.spec.ts': 'spin button on real frames: template ZNCC, Hough, segmentation, the cascade',
      'preflight.spec.ts': 'the guard that only allows a real-money spin when balance, wager and currency are read',
      'steps.spec.ts': 'atomic-step runner: data flow, fault isolation, retries only for reads (never spins)',
      'reporter.spec.ts': 'failures-only report: requirements per step, screenshot + why only on failures',
    };
    for (const [f, r] of files) md(`| \`${cell(f)}\` | ${what[path.basename(f)] ?? ''} | ${r.passed} | ${r.failed} |`);
    md();
  } else md('_Unit results not found._');

  // ── vision benchmark (docs/vision-approaches/results.json) ─────────────────────────────────────────────────
  const bench = read('docs/vision-approaches/results.json');
  if (bench?.spinButton) {
    const es = { 'template ZNCC': 'Template ZNCC', 'template seeded by Hough': 'Template seeded by Hough (used)', 'Hough circles': 'Circle Hough', segmentation: 'Segmentation' };
    const cases = bench.spinButton.cases;
    md('### 🎯 Finding the spin button — measured on real game frames');
    md();
    md('| Technique | Hits | False positives | Mean error (button radii) | First search, median |');
    md('|---|---|---|---|---|');
    for (const t of [...new Set(cases.map((c) => c.technique))]) {
      const mine = cases.filter((c) => c.technique === t);
      const pos = mine.filter((c) => c.verdict === 'HIT' || c.verdict === 'MISS');
      const neg = mine.filter((c) => c.verdict === 'FALSE+' || c.verdict === 'OK-NONE');
      const hits = pos.filter((c) => c.verdict === 'HIT');
      const ms = pos.map((c) => c.ms).sort((a, b) => a - b);
      const dist = hits.length ? (hits.reduce((a, c) => a + c.dist, 0) / hits.length).toFixed(2) : '–';
      md(`| ${es[t] ?? t} | ${hits.length}/${pos.length} | ${neg.filter((c) => c.verdict === 'FALSE+').length}/${neg.length} | ${dist} | ${ms[Math.floor(ms.length / 2)]} ms |`);
    }
    md();
  }
  if (bench?.hudOcr) {
    md('### 🔢 Reading CREDIT / BET (truth: 99,90 € / 2,00 €)');
    md();
    md('| HUD band | Preprocessing | CREDIT | BET | Correct | ms |');
    md('|---|---|---|---|---|---|');
    for (const r of bench.hudOcr) md(`| ${r.region} | ${cell(r.mode)} | ${r.CREDIT} | ${r.BET} | ${r.correct === 'YES' ? '✅' : '❌'} | ${r.ms} |`);
    md();
  }
  if (bench?.motion) {
    md('### 🎞️ Did the reels move? (fraction of pixels changed)');
    md();
    md('| Frame pair | Change |');
    md('|---|---|');
    for (const r of bench.motion) md(`| ${r.pair} | ${r.diff.toFixed(3)} |`);
    md();
  }
} else if (mode === 'live') {
  const report = read('site/checks.json');
  md('## 🎰 Live proof — betsson.es, Pragmatic Play, Real Play (self-hosted Brave runner in Spain)');
  md();
  if (!report) md('_No live report (site/checks.json) — the live job did not produce one._');
  else {
    const t = report.totals ?? {};
    md(`**${t.PASS ?? 0} checks passed · ${t.FAIL ?? 0} failed · ${t.INFO ?? 0} info**`);
    md();
    const byScenario = new Map();
    for (const r of report.rows) {
      const k = `${r.market} · ${r.scenario}`;
      const s = byScenario.get(k) ?? { PASS: 0, FAIL: 0, INFO: 0, fails: [] };
      s[r.status]++;
      if (r.status === 'FAIL') s.fails.push(r);
      byScenario.set(k, s);
    }
    md('| Journey | Passed | Failed | Note |');
    md('|---|---|---|---|');
    for (const [k, s] of byScenario) {
      const demo = /fallo provocado|DEMO informe/i.test(k);
      md(`| ${cell(k)} | ${s.PASS} | ${s.FAIL} | ${demo ? '🧪 fails ON PURPOSE (CREDIT read altered by −1 €) to show the failure report' : s.FAIL ? '❌' : '✅'} |`);
    }
    md();
    const realFails = report.rows.filter((r) => r.status === 'FAIL' && !/fallo provocado|DEMO informe/i.test(r.scenario));
    if (realFails.length) {
      md('### ❌ Failures');
      md('| Journey | Check | Expected | Observed |');
      md('|---|---|---|---|');
      for (const r of realFails) md(`| ${cell(r.scenario)} | ${cell(r.title)} | ${cell(r.expected).slice(0, 90)} | ${cell(r.actual).slice(0, 120)} |`);
      md();
    }
  }
} else {
  console.error('Usage: node scripts/ci-summary.cjs <offline|live>');
  process.exit(2);
}

const text = out.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
else process.stdout.write(text);
