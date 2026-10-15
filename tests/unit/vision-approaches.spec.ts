/**
 * Vision approaches: offline tests + benchmark on REAL frames (tests/unit/fixtures).
 *   npm run unit                      → the assertions below
 *   node scripts/bench-vision.cjs     → prints the comparison tables (BENCH=1)
 * Ground truth (button centre and radius) was measured from the pixels of each frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { getMarket } from '../../src/config/markets';
import { pragmaticControls } from '../../src/vision/controls/game-controls';
import { HoughCircleTarget } from '../../src/vision/controls/hough-target';
import type { ScreenTarget } from '../../src/vision/controls/screen-target';
import { TemplateTarget } from '../../src/vision/controls/screen-target';
import { SegmentationTarget } from '../../src/vision/controls/segmentation-target';
import { cropRel } from '../../src/vision/game-screen';
import { parseHud } from '../../src/vision/hud';
import { diffRatio } from '../../src/vision/motion';
import { Ocr } from '../../src/vision/ocr';

const FIX = path.resolve('tests/unit/fixtures');
const TEMPLATE = path.resolve('assets/templates/pragmatic/spin.png');

interface Case {
  name: string;
  png: () => Promise<Buffer>;
  /** Button centre (fractions) and radius (fraction of width); null = there is no button. */
  truth: { x: number; y: number; r: number } | null;
}

const file = (p: string) => () => Promise.resolve(fs.readFileSync(path.join(FIX, p)));
const scaled = (p: string, f: number) => async () => {
  const src = fs.readFileSync(path.join(FIX, p));
  const m = await sharp(src).metadata();
  return sharp(src).resize({ width: Math.round(m.width! * f) }).png().toBuffer();
};

const POSITIVES: Array<{ file: string; truth: { x: number; y: number; r: number }; label: string }> = [
  { file: 'vision/intro-triple-hop-pots.png', truth: { x: 0.5021, y: 0.8807, r: 36.5 / 1212 }, label: 'intro (black disk)' },
  { file: 'pragmatic-triple-hop-pots.png', truth: { x: 0.5, y: 0.836, r: 31 / 1212 }, label: 'playable (teal disk)' },
  { file: 'vision/intro-triple-hop-pots-1273.png', truth: { x: 0.48, y: 0.8659, r: 36 / 1273 }, label: 'intro, other window' },
];

/** Full benchmark: 3 scales per frame. Plain `npm run unit`: original size only (keeps the team's unit run fast). */
const SCALES = process.env.BENCH ? [0.7, 1, 1.3] : [1];

const CASES: Case[] = [
  ...POSITIVES.flatMap((p) =>
    SCALES.map((f) => ({ name: `${p.label} ×${f}`, png: f === 1 ? file(p.file) : scaled(p.file, f), truth: p.truth })),
  ),
  {
    name: 'NEG playable, button covered',
    truth: null,
    png: async () => {
      const src = fs.readFileSync(path.join(FIX, 'pragmatic-triple-hop-pots.png'));
      const cover = Buffer.from('<svg width="1212" height="683"><circle cx="606" cy="571" r="46" fill="#1f8f95"/></svg>');
      return sharp(src).composite([{ input: cover }]).png().toBuffer();
    },
  },
  {
    name: 'NEG intro, top part only',
    truth: null,
    png: async () => sharp(fs.readFileSync(path.join(FIX, 'vision/intro-triple-hop-pots.png'))).extract({ left: 0, top: 0, width: 1212, height: 380 }).png().toBuffer(),
  },
  {
    name: 'NEG side artwork only',
    truth: null,
    png: async () => sharp(fs.readFileSync(path.join(FIX, 'vision/intro-triple-hop-pots.png'))).extract({ left: 0, top: 0, width: 440, height: 683 }).png().toBuffer(),
  },
];

/** Fresh instances per case: TemplateTarget remembers the last position (fast path), which would bias results. */
const TECHNIQUES: Array<{ name: string; make: () => ScreenTarget }> = [
  { name: 'template ZNCC', make: () => new TemplateTarget('spin', TEMPLATE, { circular: true }) },
  { name: 'template seeded by Hough', make: () => new TemplateTarget('spin', TEMPLATE, { circular: true, seed: new HoughCircleTarget('hough') }) },
  { name: 'Hough circles', make: () => new HoughCircleTarget('spin') },
  { name: 'segmentation', make: () => new SegmentationTarget('spin') },
];

interface Row {
  technique: string;
  case: string;
  verdict: 'HIT' | 'MISS' | 'FALSE+' | 'OK-NONE';
  /** Distance to the true centre in button radii (hit if < 0.6). */
  dist?: number;
  ms: number;
}

/** Plain `npm run unit`: only the most relevant negative (button covered, other round buttons still there). */
const RUN_CASES = process.env.BENCH ? CASES : CASES.filter((c) => c.truth || c.name.includes('button covered'));

async function evaluate(): Promise<Row[]> {
  const rows: Row[] = [];
  for (const c of RUN_CASES) {
    const png = await c.png();
    const size = await sharp(png).metadata();
    for (const t of TECHNIQUES) {
      const target = t.make();
      const s = Date.now();
      const m = await target.locate(png);
      const ms = Date.now() - s;
      if (!c.truth) {
        rows.push({ technique: t.name, case: c.name, verdict: m ? 'FALSE+' : 'OK-NONE', ms });
        continue;
      }
      if (!m) {
        rows.push({ technique: t.name, case: c.name, verdict: 'MISS', ms });
        continue;
      }
      const dPx = Math.hypot((m.x - c.truth.x) * size.width!, (m.y - c.truth.y) * size.height!);
      const dist = dPx / (c.truth.r * size.width!);
      rows.push({ technique: t.name, case: c.name, verdict: dist < 0.6 ? 'HIT' : 'MISS', dist, ms });
    }
  }
  return rows;
}

let cached: Promise<Row[]> | undefined;
const results = () => (cached ??= evaluate());

test.describe('vision approaches — spin button on real frames', () => {
  test.describe.configure({ timeout: 180_000 });

  test('template ZNCC: finds the button in every positive case, no false positives', async () => {
    const rows = (await results()).filter((r) => r.technique === 'template ZNCC');
    expect(rows.filter((r) => r.verdict === 'MISS').map((r) => r.case)).toEqual([]);
    expect(rows.filter((r) => r.verdict === 'FALSE+').map((r) => r.case)).toEqual([]);
  });

  // (speed is compared in the benchmark, not asserted here: timings in unit tests are machine-dependent)
  test('template seeded by Hough: same hits as the template, no false positives', async () => {
    const seeded = (await results()).filter((r) => r.technique === 'template seeded by Hough');
    expect(seeded.filter((r) => r.verdict === 'MISS').map((r) => r.case)).toEqual([]);
    expect(seeded.filter((r) => r.verdict === 'FALSE+').map((r) => r.case)).toEqual([]);
  });

  test('Hough circles: finds the button in every positive case (no template), no false positives', async () => {
    const rows = (await results()).filter((r) => r.technique === 'Hough circles');
    expect(rows.filter((r) => r.verdict === 'MISS').map((r) => r.case)).toEqual([]);
    expect(rows.filter((r) => r.verdict === 'FALSE+').map((r) => r.case)).toEqual([]);
  });

  test('segmentation: never a false positive; finds the in-game (teal) button', async () => {
    const rows = (await results()).filter((r) => r.technique === 'segmentation');
    expect(rows.filter((r) => r.verdict === 'FALSE+').map((r) => r.case)).toEqual([]);
    expect(rows.filter((r) => r.case.startsWith('playable') && r.verdict === 'HIT').length).toBeGreaterThan(0);
  });

  test('Pragmatic cascade: template → Hough → SPACE → calibrated position', async () => {
    const controls = pragmaticControls({ frameUrl: /x/, hud: { x: 0, y: 0.8, w: 1, h: 0.2 }, reels: { x: 0, y: 0, w: 1, h: 1 }, spinButton: { x: 0.5, y: 0.8 } }, {} as Ocr, getMarket('es'));
    expect(controls.spin.map((a) => a.name)).toEqual(['click round arrows button', 'click round spin button (Hough)', 'press Space', 'click spin button']);
    // the composite spin button still finds the real button on a real frame
    const m = await controls.spinButton.locate(fs.readFileSync(path.join(FIX, 'pragmatic-triple-hop-pots.png')));
    expect(m).not.toBeNull();
    expect(m!.x).toBeCloseTo(0.5, 1);
    expect(m!.y).toBeCloseTo(0.836, 1);
  });

  test('BENCH: comparison table (BENCH=1)', async () => {
    test.skip(!process.env.BENCH, 'run with BENCH=1 (node scripts/bench-vision.cjs)');
    const rows = await results();
    console.log('\n=== Spin button: per case ===');
    console.table(rows.map((r) => ({ technique: r.technique, case: r.case, verdict: r.verdict, 'dist (radii)': r.dist?.toFixed(2) ?? '', ms: r.ms })));
    console.log('\n=== Spin button: summary ===');
    console.table(
      TECHNIQUES.map((t) => {
        const mine = rows.filter((r) => r.technique === t.name);
        const pos = mine.filter((r) => r.verdict === 'HIT' || r.verdict === 'MISS');
        const neg = mine.filter((r) => r.verdict === 'FALSE+' || r.verdict === 'OK-NONE');
        const hits = pos.filter((r) => r.verdict === 'HIT');
        const msSorted = mine.map((r) => r.ms).sort((a, b) => a - b);
        return {
          technique: t.name,
          'hit rate': `${hits.length}/${pos.length}`,
          'false positives': `${neg.filter((r) => r.verdict === 'FALSE+').length}/${neg.length}`,
          'mean dist (radii)': hits.length ? (hits.reduce((a, r) => a + (r.dist ?? 0), 0) / hits.length).toFixed(2) : '-',
          'median ms': msSorted[Math.floor(msSorted.length / 2)],
          'max ms': msSorted[msSorted.length - 1],
        };
      }),
    );
  });
});

test.describe('vision approaches — HUD reading (OCR) on a real frame', () => {
  test.describe.configure({ timeout: 180_000 });

  test('BENCH: plain OCR vs bright-text binarisation (BENCH=1)', async () => {
    test.skip(!process.env.BENCH, 'run with BENCH=1');
    const market = getMarket('es');
    const ocr = new Ocr();
    try {
      const frame = fs.readFileSync(path.join(FIX, 'pragmatic-triple-hop-pots.png'));
      const rows = [];
      for (const [region, label] of [[{ x: 0, y: 0.8, w: 1, h: 0.2 }, 'HUD band 20%'], [{ x: 0, y: 0.9, w: 1, h: 0.1 }, 'HUD band 10%']] as const) {
        const { png, box } = await cropRel(frame, region);
        for (const [mode, threshold] of [['plain (contrast + invert)', undefined], ['binarised ≥180', 180], ['binarised ≥210', 210]] as const) {
          const s = Date.now();
          const r = await ocr.read(png, market.ocrLang, { scale: 3, offset: { x: box.x, y: box.y }, brightTextThreshold: threshold });
          const ms = Date.now() - s;
          const hud = parseHud(r.rows, market.gameText);
          const credit = hud.credit?.value?.amount;
          const bet = hud.bet?.value?.amount;
          rows.push({ region: label, mode, CREDIT: credit ?? '-', BET: bet ?? '-', correct: credit === 99.9 && bet === 2 ? 'YES' : 'no', ms });
        }
      }
      console.log('\n=== HUD OCR (truth: CRÉDITO 99,90 € · APUESTA 2,00 €) ===');
      console.table(rows);
    } finally {
      await ocr.terminate();
    }
  });
});

test.describe('vision approaches — motion (frame difference)', () => {
  test('BENCH: idle-like change vs real screen change (BENCH=1)', async () => {
    test.skip(!process.env.BENCH, 'run with BENCH=1');
    const playable = fs.readFileSync(path.join(FIX, 'pragmatic-triple-hop-pots.png'));
    const intro = fs.readFileSync(path.join(FIX, 'vision/intro-triple-hop-pots.png'));
    const recompressed = await sharp(playable).jpeg({ quality: 55 }).png().toBuffer(); // compression noise ≈ idle shimmer
    const shifted = await sharp(playable).extract({ left: 2, top: 1, width: 1208, height: 680 }).resize(1212, 683).png().toBuffer(); // 1–2 px jitter
    console.log('\n=== Frame difference (fraction of pixels changed) ===');
    console.table([
      { pair: 'same frame', diff: (await diffRatio(playable, playable)).toFixed(3) },
      { pair: 'recompressed (noise)', diff: (await diffRatio(playable, recompressed)).toFixed(3) },
      { pair: '1–2 px jitter', diff: (await diffRatio(playable, shifted)).toFixed(3) },
      { pair: 'intro → playable (real change)', diff: (await diffRatio(intro, playable)).toFixed(3) },
    ]);
  });
});
