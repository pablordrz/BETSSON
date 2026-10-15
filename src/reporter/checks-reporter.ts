import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { CheckRecord } from '../utils/checks';

interface Row extends CheckRecord {
  testId: string;
}

interface Options {
  outputDir?: string;
  /** Relative link from the checks page to the Playwright HTML report. */
  playwrightReportHref?: string;
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * Produces the challenge report: one PASS/FAIL row per check, identified by scenario and market,
 * as checks.json + index.html, linking each row to the Playwright report (screenshots, trace, video).
 */
export default class ChecksReporter implements Reporter {
  private rows: Row[] = [];
  private outputDir: string;
  private pwHref: string;

  constructor(opts: Options = {}) {
    this.outputDir = opts.outputDir ?? process.env.CHECKS_REPORT_DIR ?? 'reports';
    this.pwHref = opts.playwrightReportHref ?? 'playwright/index.html';
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? '';
    if (project.startsWith('calibrate') || project === 'unit') return;
    const checks: Row[] = [];
    for (const a of result.attachments) {
      if (a.name !== 'check' || !a.body) continue;
      try {
        checks.push({ ...(JSON.parse(a.body.toString()) as CheckRecord), testId: test.id });
      } catch {
        /* ignore malformed */
      }
    }
    this.rows.push(...checks);
    if (result.status === 'skipped') {
      this.rows.push({ scenario: test.title, market: project, id: 'run', title: 'Scenario executed', status: 'FAIL', expected: 'executed', actual: `skipped: ${test.annotations.map((a) => a.description).join('; ')}`, testId: test.id });
    } else if (result.status !== 'passed' && result.errors.length && !checks.some((c) => c.status === 'FAIL')) {
      // the scenario aborted before (or without) recording a failing check → make that visible as a row
      const msg = stripAnsi(result.errors[0].message ?? 'error').split('\n').slice(0, 3).join(' ');
      this.rows.push({ scenario: test.title, market: project, id: 'run', title: 'Scenario ran to completion', status: 'FAIL', expected: 'no execution error', actual: msg, testId: test.id });
    }
  }

  async onEnd(result: FullResult) {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const summary = { generatedAt: new Date().toISOString(), overall: result.status, totals: count(this.rows), rows: this.rows };
    fs.writeFileSync(path.join(this.outputDir, 'checks.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'index.html'), this.html(summary));
    console.log(`\nChecks report: ${path.resolve(this.outputDir, 'index.html')} — ${summary.totals.PASS} pass, ${summary.totals.FAIL} fail, ${summary.totals.INFO} info`);
  }

  private html(s: { generatedAt: string; overall: string; totals: Record<string, number>; rows: Row[] }) {
    const groups = new Map<string, Row[]>();
    for (const r of s.rows) {
      const k = `${r.market} · ${r.scenario}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const badge = (st: string) => `<span class="b ${st}">${st}</span>`;
    const sections = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, rows]) => {
        const c = count(rows);
        const verdict = c.FAIL ? 'FAIL' : 'PASS';
        return `<section><h2>${badge(verdict)} ${esc(k)} <small>${c.PASS} pass · ${c.FAIL} fail · ${c.INFO} info · <a href="${this.pwHref}#?testId=${rows[0].testId}">evidence (screenshots, trace, video) →</a></small></h2>
        <table><thead><tr><th>Status</th><th>Check</th><th>Expected</th><th>Observed on screen</th><th>Notes</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${badge(r.status)}</td><td><b>${esc(r.title)}</b><br><code>${esc(r.id)}</code></td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td><td>${esc(r.note ?? '')}${r.evidence?.length ? `<br><i>evidence: ${r.evidence.map(esc).join(', ')}</i>` : ''}</td></tr>`).join('')}
        </tbody></table></section>`;
      })
      .join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Game Validation Report</title><style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#667;--line:#e3e6ea;--pass:#0a7d32;--fail:#c62828;--info:#1565c0}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#e8eaed;--mut:#9aa;--line:#2a2f36}}
body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px 16px;max-width:1200px;margin:auto}
h1{margin:0 0 4px}small,.mut{color:var(--mut);font-weight:400}h2{font-size:17px;margin:28px 0 8px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid var(--line)}
th{font-size:12px;text-transform:uppercase;color:var(--mut)}code{font-size:12px;color:var(--mut)}
.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;color:#fff}.PASS{background:var(--pass)}.FAIL{background:var(--fail)}.INFO{background:var(--info)}
.tot{display:flex;gap:12px;margin:12px 0}.tot div{border:1px solid var(--line);border-radius:8px;padding:8px 14px}
a{color:var(--info)}@media(max-width:700px){td:nth-child(5),th:nth-child(5){display:none}}
</style></head><body>
<h1>Intelligent Game Validation</h1>
<div class="mut">Betsson · Pragmatic Play Real Play · generated ${esc(s.generatedAt)} · run ${esc(s.overall)} · <a href="${this.pwHref}">full Playwright report</a></div>
<div class="tot"><div>${badge('PASS')} ${s.totals.PASS}</div><div>${badge('FAIL')} ${s.totals.FAIL}</div><div>${badge('INFO')} ${s.totals.INFO}</div></div>
${sections || '<p>No checks recorded.</p>'}
</body></html>`;
  }
}

function count(rows: CheckRecord[]) {
  return { PASS: rows.filter((r) => r.status === 'PASS').length, FAIL: rows.filter((r) => r.status === 'FAIL').length, INFO: rows.filter((r) => r.status === 'INFO').length };
}
