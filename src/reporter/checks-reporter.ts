import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { CheckRecord } from '../utils/checks';
import { explain, firstLine } from './explain';

interface Row extends CheckRecord {
  testId: string;
  /** Screenshots copied next to the report (paths relative to it). FAIL rows only. */
  images?: string[];
}

interface Options {
  outputDir?: string;
  /** Relative link from the checks page to the Playwright HTML report. */
  playwrightReportHref?: string;
}

type Attachment = TestResult['attachments'][number];

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * The challenge report, failures only: one card per failed check with its screenshot, expected, observed,
 * why and the step's last log lines; passing checks are only counted ("N comprobaciones correctas").
 * Everything (PASS rows included) is still written to checks.json for machines and CI.
 */
export default class ChecksReporter implements Reporter {
  private rows: Row[] = [];
  private outputDir: string;
  private pwHref: string;
  private imageCount = 0;
  private started = false;

  constructor(opts: Options = {}) {
    this.outputDir = opts.outputDir ?? process.env.CHECKS_REPORT_DIR ?? 'reports';
    this.pwHref = opts.playwrightReportHref ?? 'playwright/index.html';
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? '';
    if (project.startsWith('calibrate') || project === 'unit') return;
    if (!this.started) {
      // first live test of the run: screenshots of a previous report must not linger next to this one
      fs.rmSync(path.join(this.outputDir, 'evidence'), { recursive: true, force: true });
      this.started = true;
    }
    const checks: Row[] = [];
    for (const a of result.attachments) {
      if (a.name !== 'check' || !a.body) continue;
      try {
        checks.push({ ...(JSON.parse(a.body.toString()) as CheckRecord), testId: test.id });
      } catch {
        /* ignore malformed */
      }
    }
    if (result.status === 'skipped') {
      const why = test.annotations.map((a) => a.description).join('; ');
      checks.push({ scenario: test.title, market: project, id: 'run', title: 'Escenario ejecutado', status: 'FAIL', expected: 'se ejecuta', actual: `omitido: ${why}`, why: explain(why), testId: test.id });
    } else if (result.status !== 'passed' && result.errors.length && !checks.some((c) => c.status === 'FAIL')) {
      // the scenario aborted before (or without) recording a failing check → make that visible as a card
      const raw = stripAnsi(result.errors[0].message ?? 'error');
      checks.push({
        scenario: test.title,
        market: project,
        id: 'run',
        title: 'El escenario llega hasta el final',
        status: 'FAIL',
        expected: 'sin errores de ejecución',
        actual: firstLine(raw),
        why: explain(raw),
        evidence: result.attachments.filter((a) => a.contentType === 'image/png').slice(-1).map((a) => a.name),
        testId: test.id,
      });
    }
    for (const row of checks) if (row.status === 'FAIL' && row.evidence?.length) row.images = this.copyImages(row.evidence, result.attachments);
    this.rows.push(...checks);
  }

  async onEnd(result: FullResult) {
    if (!this.started) return; // only unit/calibration tests ran: keep the last real report
    fs.mkdirSync(this.outputDir, { recursive: true });
    const summary = { generatedAt: new Date().toISOString(), overall: result.status, totals: count(this.rows), rows: this.rows };
    fs.writeFileSync(path.join(this.outputDir, 'checks.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'index.html'), this.html(summary));
    const t = summary.totals;
    console.log(`\nInforme: ${path.resolve(this.outputDir, 'index.html')} — ${t.FAIL ? `${t.FAIL} fallo(s)` : 'todo correcto'} · ${t.PASS} comprobaciones correctas`);
  }

  /** Copies the screenshots a row refers to (by attachment name) next to the report. */
  private copyImages(names: string[], attachments: Attachment[]): string[] {
    const out: string[] = [];
    for (const name of names) {
      const a = [...attachments].reverse().find((x) => x.name === name && x.contentType === 'image/png');
      if (!a) continue;
      const file = `evidence/${++this.imageCount}-${name.replace(/[^\w.-]+/g, '_').slice(0, 60)}.png`;
      const dest = path.join(this.outputDir, file);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (a.body) fs.writeFileSync(dest, a.body);
        else if (a.path) fs.copyFileSync(a.path, dest);
        else continue;
        out.push(file);
      } catch {
        /* a missing screenshot must never break the report */
      }
    }
    return out;
  }

  private html(s: { generatedAt: string; overall: string; totals: Record<string, number>; rows: Row[] }) {
    const failures = s.rows.filter((r) => r.status === 'FAIL');
    const groups = new Map<string, Row[]>();
    for (const r of failures) {
      const k = `${r.market} · ${r.scenario}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const field = (label: string, value: string | undefined, cls = '') => (value ? `<dt>${label}</dt><dd class="${cls}">${esc(value)}</dd>` : '');
    const card = (r: Row) => `<article class="card">
      <header><span class="b FAIL">FALLO</span> <b>${esc(r.title)}</b> <code>${esc(r.step ?? r.id)}</code></header>
      <dl>${field('Esperado', r.expected)}${field('Observado', r.actual)}${field('Por qué', r.why, 'why')}${field('Nota', r.note, 'mut')}</dl>
      ${r.log?.length ? `<details open><summary>Log del paso</summary><pre>${esc(r.log.join('\n'))}</pre></details>` : ''}
      ${(r.images ?? []).map((src) => `<a href="${esc(src)}" target="_blank"><img src="${esc(src)}" alt="${esc(r.title)}" loading="lazy"></a>`).join('')}
      <a class="more" href="${this.pwHref}#?testId=${r.testId}">traza y detalles →</a>
    </article>`;
    const sections = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, rows]) => `<section><h2>${esc(k)} <small>${rows.length} fallo(s)</small></h2>${rows.map(card).join('')}</section>`)
      .join('');
    const t = s.totals;
    const verdict = t.FAIL ? `<div class="verdict bad">✗ ${t.FAIL} fallo${t.FAIL === 1 ? '' : 's'}</div>` : `<div class="verdict good">✓ Todo correcto</div>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de validación</title><style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#667;--line:#e3e6ea;--card:#fafbfc;--pass:#0a7d32;--fail:#c62828;--info:#1565c0}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#e8eaed;--mut:#9aa;--line:#2a2f36;--card:#171b21}}
body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);margin:0 auto;padding:24px 16px;max-width:1100px}
h1{margin:0 0 4px}small,.mut{color:var(--mut);font-weight:400}h2{font-size:17px;margin:28px 0 10px}
.verdict{font-size:28px;font-weight:800;margin:16px 0}.good{color:var(--pass)}.bad{color:var(--fail)}
.card{border:1px solid var(--line);border-left:4px solid var(--fail);border-radius:8px;background:var(--card);padding:12px 14px;margin:0 0 14px}
.card header{margin-bottom:8px}code{font-size:12px;color:var(--mut)}
dl{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;margin:0}dt{color:var(--mut);font-size:12px;text-transform:uppercase;padding-top:2px}dd{margin:0;overflow-wrap:anywhere}
dd.why{font-weight:600}pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;margin:6px 0}
summary{cursor:pointer;color:var(--mut);font-size:12px;margin-top:8px}
img{display:block;max-width:100%;max-height:420px;border:1px solid var(--line);border-radius:6px;margin-top:10px}
.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;color:#fff}.FAIL{background:var(--fail)}
.more{display:inline-block;margin-top:8px;font-size:13px}a{color:var(--info)}
.ok{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);color:var(--pass);font-weight:600}
@media(max-width:600px){dl{grid-template-columns:1fr}dt{padding-top:6px}}
</style></head><body>
<h1>Intelligent Game Validation</h1>
<div class="mut">Betsson · Pragmatic Play Real Play · ${esc(s.generatedAt)} · <a href="${this.pwHref}">informe completo de Playwright</a></div>
${verdict}
${sections}
<p class="ok">✓ ${t.PASS} comprobacion${t.PASS === 1 ? '' : 'es'} correcta${t.PASS === 1 ? '' : 's'}${t.INFO ? ` <span class="mut">· ${t.INFO} informativa(s) en checks.json</span>` : ''}</p>
</body></html>`;
  }
}

function count(rows: CheckRecord[]) {
  return { PASS: rows.filter((r) => r.status === 'PASS').length, FAIL: rows.filter((r) => r.status === 'FAIL').length, INFO: rows.filter((r) => r.status === 'INFO').length };
}
