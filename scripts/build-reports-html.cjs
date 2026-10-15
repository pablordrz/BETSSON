/**
 * Builds the HTML version of the reports from their Markdown (single source):   npm run reports:html
 *   docs/reports/NN-*.md  →  docs/reports/NN-*.html   + docs/reports/index.html (cover with every report)
 * Small Markdown subset (headings, paragraphs, lists, tables, code, quotes, images, links, bold/italic/code).
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve('docs', 'reports');
const files = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) => `<a href="${href.replace(/^(\d\d-[^)]*)\.md$/, '$1.html')}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(«])\*([^*\s][^*]*?)\*(?=[\s).,;:»]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function markdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const q = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) q.push(lines[i].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      for (; i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i]); i++) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i + 1])) item += ' ' + lines[++i].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const p = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|```|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i]); i++) p.push(lines[i]);
    const text = p.join(' ');
    out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(text.trim()) ? `<figure>${inline(text)}</figure>` : `<p>${inline(text)}</p>`);
  }
  return out.join('\n');
}

/** Short labels for the top menu. */
const NAV = { '01': 'Escenario 1', '02': 'Escenario 2', '03': 'Series', '04': 'Subir apuesta', '05': 'Informe de fallos', '06': 'Visión y OCR', '07': 'Problemas resueltos', '08': 'Calidad y arquitectura' };
const titleOf = (md) => (md.match(/^#\s+(.*)$/m)?.[1] ?? '').replace(/^Informe \d+ — /, '');
const CSS = `
:root{--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e1e0d9;--bg:#fcfcfb;--card:#fff;--accent:#2a78d6;--code:#f1f0ec}
@media (prefers-color-scheme:dark){:root{--ink:#f4f3ee;--ink2:#c3c2b7;--muted:#898781;--line:#3a3a37;--bg:#1a1a19;--card:#222221;--accent:#3987e5;--code:#2c2c2a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{border-bottom:1px solid var(--line);background:var(--card)}header .in,main{max-width:1080px;margin:0 auto;padding:16px}
header a{color:var(--ink2);text-decoration:none;margin-right:14px;font-size:14px;white-space:nowrap}header a.on{color:var(--accent);font-weight:600}
nav{display:flex;flex-wrap:wrap;gap:4px 0}h1{font-size:30px;line-height:1.25;margin:24px 0 8px}h2{margin:36px 0 10px}h3{margin:24px 0 8px}
a{color:var(--accent)}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.9em}
pre{background:var(--code);padding:14px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.45}pre code{background:none;padding:0}
.table{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card)}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}th{background:var(--code)}
img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;display:block;margin:10px 0}figure{margin:16px 0}
blockquote{margin:16px 0;padding:10px 16px;border-left:4px solid var(--accent);background:var(--card);color:var(--ink2)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:20px 0}
.card{display:block;border:1px solid var(--line);border-radius:10px;padding:16px;background:var(--card);text-decoration:none;color:var(--ink)}
.card b{display:block;margin-bottom:4px}.card span{color:var(--ink2);font-size:14px}.foot{color:var(--muted);font-size:13px;margin:40px 0 20px}
`;
const reports = files.map((f) => {
  const md = fs.readFileSync(path.join(DIR, f), 'utf8');
  return { md, file: f.replace(/\.md$/, '.html'), title: titleOf(md), n: f.slice(0, 2), lead: (md.match(/^\*\*Resultado:([^*]+)\*\*/m)?.[1] ?? '').trim() };
});
const page = (title, active, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header><div class="in"><nav><a href="index.html" class="${active === 'index' ? 'on' : ''}">Inicio</a>${reports
  .map((r) => `<a href="${r.file}" class="${active === r.file ? 'on' : ''}">${r.n} · ${esc(NAV[r.n] ?? r.title.split(':')[0])}</a>`)
  .join('')}</nav></div></header>
<main>${body}<p class="foot">Intelligent Game Validation · Betsson × Malackathon 2026 · generado desde docs/reports/*.md (npm run reports:html)</p></main></body></html>`;

for (const r of reports) fs.writeFileSync(path.join(DIR, r.file), page(r.title, r.file, markdown(r.md)));
const cover = `<h1>Intelligent Game Validation — informes</h1>
<p>Pragmatic Play en <b>betsson.es</b>, Real Play, validado <b>como un jugador</b>: solo píxeles (OCR y visión), nunca el DOM del juego. Ejecuciones reales del 15/10/2026, con imágenes, logs y cifras.</p>
<div class="cards">${reports.map((r) => `<a class="card" href="${r.file}"><b>${r.n} · ${esc(r.title)}</b><span>${esc(r.lead || '')}</span></a>`).join('')}</div>
<figure><img src="../evidence/hud-ocr-anotado.jpg" alt="Lo que ve el checker"></figure>`;
fs.writeFileSync(path.join(DIR, 'index.html'), page('Informes — Intelligent Game Validation', 'index', cover));
console.log(`HTML: ${reports.length} reports + index.html in ${path.relative(process.cwd(), DIR)}`);
