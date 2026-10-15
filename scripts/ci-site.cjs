/**
 * Builds the GitHub Pages site that shows EVERYTHING in one place (pages/):
 *   pages/index.html            landing page with the numbers of this run
 *   pages/unit/                 Playwright report of the offline tests (from the offline job)
 *   pages/vision/               vision benchmark charts + results.json
 *   pages/live/                 live report of `npm run all` (when the live job ran)
 *   pages/live-latest/          otherwise: the last live report committed in the repo (site/), clearly labelled
 *   node scripts/ci-site.cjs <offlineDir> [liveDir]
 */
const fs = require('node:fs');
const path = require('node:path');

const [offlineDir = 'offline', liveDir = 'live'] = process.argv.slice(2);
const OUT = path.resolve('pages');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copy = (from, to) => fs.existsSync(from) && (fs.cpSync(from, path.join(OUT, to), { recursive: true, filter: (f) => !f.endsWith('.zip') }), true);
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : undefined);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const hasUnit = copy(path.join(offlineDir, 'unit-report'), 'unit');
const hasVision = copy(path.join(offlineDir, 'vision'), 'vision');
const unit = read(path.join(offlineDir, 'unit.json'));
const hasLive = copy(liveDir, 'live');
const hasCommittedLive = !hasLive && copy('site', 'live-latest');
const liveChecks = read(path.join(OUT, hasLive ? 'live' : 'live-latest', 'checks.json'));

const run = process.env.GITHUB_SERVER_URL ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
const charts = hasVision ? fs.readdirSync(path.join(OUT, 'vision')).filter((f) => f.endsWith('.png')).sort() : [];
const s = unit?.stats ?? {};
const t = liveChecks?.totals ?? {};

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Intelligent Game Validation</title>
<style>
:root{--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e1e0d9;--bg:#fcfcfb;--good:#0ca30c;--bad:#d03b3b;--accent:#2a78d6}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 64px}h1{margin:0 0 4px}h2{margin:40px 0 12px}
.sub{color:var(--ink2)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:20px}
.card{border:1px solid var(--line);border-radius:10px;padding:16px;background:#fff}.big{font-size:32px;font-weight:700}
.good{color:var(--good)}.bad{color:var(--bad)}a{color:var(--accent)}img{max-width:100%;border:1px solid var(--line);border-radius:8px;margin:8px 0}
.note{color:var(--ink2);font-size:14px}code{background:#f1f0ec;padding:1px 5px;border-radius:4px}
</style></head><body><main>
<h1>Intelligent Game Validation</h1>
<div class="sub">Betsson × Malackathon 2026 · Pragmatic Play en betsson.es, Real Play, validado <b>como un jugador</b> (solo píxeles: OCR + visión)${run ? ` · <a href="${run}">ejecución en GitHub Actions</a>` : ''}</div>

<div class="grid">
  <div class="card"><div class="big ${s.unexpected ? 'bad' : 'good'}">${s.expected ?? '–'}</div>tests offline superados${s.unexpected ? ` · <span class="bad">${s.unexpected} fallidos</span>` : ''}</div>
  <div class="card"><div class="big good">${liveChecks ? t.PASS ?? 0 : '–'}</div>comprobaciones en vivo superadas${hasCommittedLive ? '<br><span class="note">(última ejecución en vivo guardada en el repo)</span>' : ''}</div>
  <div class="card"><div class="big">${charts.length}</div>gráficas del benchmark de visión</div>
</div>

<h2>1 · Recorridos en vivo (betsson.es, dinero real a la apuesta mínima)</h2>
${
  hasLive || hasCommittedLive
    ? `<p><a href="${hasLive ? 'live' : 'live-latest'}/index.html"><b>Informe de comprobaciones</b></a> (solo fallos, con captura y porqué) · <a href="${hasLive ? 'live' : 'live-latest'}/playwright/index.html">informe completo de Playwright</a></p>
<p class="note">Incluye los escenarios 1 (tirada completada, saldo del juego y de Betsson cuadrados) y 2 (cuenta sin saldo: tirada rechazada, mensaje en español, saldos sin cambiar), la serie de tiradas y una <b>demo de informe que falla a propósito</b> (el CRÉDITO leído se altera −1 € para mostrar cómo es un fallo).${hasCommittedLive ? ' Esta ejecución no lanzó el job en vivo: se muestra el último informe en vivo guardado en el repositorio.' : ''}</p>`
    : '<p class="note">No hay informe en vivo en esta ejecución (el job en vivo se lanza a mano en un runner con Brave en España).</p>'
}

<h2>2 · Tests offline (en cada push)</h2>
${hasUnit ? '<p><a href="unit/index.html"><b>Informe de los tests unitarios</b></a> — parsing de dinero, OCR del HUD sobre fotogramas reales, detección del botón de tirar, protección antes de tirar, ejecutor de pasos atómicos, informe de fallos.</p>' : '<p class="note">Sin informe unitario.</p>'}

<h2>3 · Enfoques de visión: qué funciona y por qué (medido)</h2>
${charts.map((c) => `<img src="vision/${esc(c)}" alt="${esc(c)}">`).join('\n')}
<p class="note">Datos: <a href="vision/results.json">results.json</a> · explicación completa en <code>docs/vision-approaches.md</code>.</p>
</main></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`pages/ built: unit=${hasUnit} vision=${charts.length} charts live=${hasLive ? 'this run' : hasCommittedLive ? 'committed' : 'none'}`);
