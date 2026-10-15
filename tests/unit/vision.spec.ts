import path from 'node:path';
import fs from 'node:fs';
/**
 * Offline unit tests of the pure parsing / vision helpers (no site, no browser):  npm run unit
 */
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { gameTexts } from '../../src/config/game-text';
import { detectCurrency, moneyEq, parseAmount, parseMoney } from '../../src/utils/money';
import { INTRO_SPIN_KEY_AFTER_MS, parseHud, readHud, shouldPressSpinOnIntro } from '../../src/vision/hud';
import { pragmaticControls } from '../../src/vision/controls/game-controls';
import { Ocr } from '../../src/vision/ocr';
import { getMarket } from '../../src/config/markets';
import { pragmaticLayout } from '../../src/config/game-layout';
import { diffRatio } from '../../src/vision/motion';
import { groupRows, type OcrWord } from '../../src/vision/ocr';
import { findTemplate } from '../../src/vision/template';
import { TemplateTarget } from '../../src/vision/controls/screen-target';

test.describe('money', () => {
  test('parses es-ES and en number formats', () => {
    expect(parseAmount('1.234,56 €')).toBe(1234.56);
    expect(parseAmount('€1,234.56')).toBe(1234.56);
    expect(parseAmount('0,20 €')).toBe(0.2);
    expect(parseAmount('100.000,00 €')).toBe(100000);
    expect(parseAmount('1.000 €')).toBe(1000);
    expect(parseAmount('0,2O €')).toBe(0.2); // OCR O→0
    expect(parseAmount('sin número')).toBeNull();
  });
  test('detects EUR', () => {
    expect(detectCurrency('5,00 €')).toBe('EUR');
    expect(detectCurrency('5,00')).toBeNull();
  });
  test('tolerance of one cent', () => {
    expect(moneyEq(10.0, 10.01)).toBe(true);
    expect(moneyEq(10.0, 10.02)).toBe(false);
    expect(parseMoney('APUESTA 0,20 €')).toMatchObject({ amount: 0.2, currency: 'EUR' });
  });
});

const w = (text: string, x: number, y: number, width = 60, h = 16): OcrWord => ({ text, confidence: 90, box: { x, y, w: width, h } });

test.describe('HUD parsing', () => {
  test('reads CRÉDITO / APUESTA / GANANCIA on one row', () => {
    const rows = groupRows([w('CRÉDITO', 10, 500), w('1.000,00', 80, 502), w('€', 140, 502, 10), w('APUESTA', 400, 501), w('0,20', 470, 500), w('€', 500, 500, 10), w('GANANCIA', 700, 500), w('0,40 €', 780, 501)]);
    const hud = parseHud(rows, gameTexts.Spanish);
    expect(hud.credit?.value).toMatchObject({ amount: 1000, currency: 'EUR' });
    expect(hud.bet?.value?.amount).toBe(0.2);
    expect(hud.win?.value?.amount).toBe(0.4);
    expect(hud.credit?.expectedLanguage).toBe(true);
  });
  test('stacked layout; English HUD is flagged as wrong language', () => {
    const rows = groupRows([w('CREDIT', 10, 480), w('€25.50', 10, 505), w('BET', 400, 480), w('€1.00', 400, 505)]);
    const hud = parseHud(rows, gameTexts.Spanish);
    expect(hud.credit?.value).toMatchObject({ amount: 25.5, currency: 'EUR' });
    expect(hud.bet?.value?.amount).toBe(1);
    expect(hud.credit?.expectedLanguage).toBe(false);
  });
  test('glued label and value', () => {
    const hud = parseHud(groupRows([w('CREDITO50,00€', 10, 500, 140)]), gameTexts.Spanish);
    expect(hud.credit?.value?.amount).toBe(50);
  });
});

test.describe('vision', () => {
  const solid = (v: number) => sharp({ create: { width: 200, height: 120, channels: 3, background: { r: v, g: v, b: v } } }).png().toBuffer();
  test('frame diff', async () => {
    const a = await solid(10);
    expect(await diffRatio(a, a)).toBe(0);
    expect(await diffRatio(a, await solid(250))).toBeGreaterThan(0.9);
  });
  test('template matching finds a button', async () => {
    const button = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 200, b: 60 } } })
      .composite([{ input: Buffer.from('<svg width="40" height="40"><circle cx="20" cy="20" r="12" fill="white"/></svg>') }])
      .png()
      .toBuffer();
    const screen = await sharp({ create: { width: 800, height: 450, channels: 3, background: { r: 30, g: 30, b: 60 } } })
      .composite([{ input: button, left: 700, top: 200 }])
      .png()
      .toBuffer();
    const m = await findTemplate(screen, button);
    expect(m.score).toBeGreaterThan(0.9);
    expect(m.x).toBeCloseTo(720 / 800, 1);
    expect(m.y).toBeCloseTo(220 / 450, 1);
  });
  test('Pragmatic round arrows icon is found by image at another scale, on another background', async () => {
    const icon = fs.readFileSync(path.resolve('assets/templates/pragmatic/spin.png'));
    const bigger = await sharp(icon).resize(84).png().toBuffer(); // the game shows it larger than in the template
    const screen = await sharp({ create: { width: 1200, height: 675, channels: 3, background: { r: 200, g: 120, b: 40 } } })
      .composite([{ input: bigger, left: 900, top: 520 }])
      .png()
      .toBuffer();
    const target = new TemplateTarget('round arrows button', path.resolve('assets/templates/pragmatic/spin.png'), { circular: true });
    const m = await target.locate(screen);
    expect(m, 'icon found').not.toBeNull();
    expect(m!.x).toBeCloseTo(942 / 1200, 1);
    expect(m!.y).toBeCloseTo(562 / 675, 1);
  });
  test('the icon is NOT found where there is none', async () => {
    const screen = await sharp({ create: { width: 1200, height: 675, channels: 3, background: { r: 200, g: 120, b: 40 } } })
      .composite([{ input: Buffer.from('<svg width="1200" height="675"><rect x="300" y="200" width="200" height="120" fill="#123"/></svg>') }])
      .png()
      .toBuffer();
    const target = new TemplateTarget('round arrows button', path.resolve('assets/templates/pragmatic/spin.png'), { circular: true });
    expect(await target.locate(screen)).toBeNull();
  });
});

test.describe('real Pragmatic frame (Triple Hop Pots, betsson.es)', () => {
  const frame = () => fs.readFileSync(path.resolve('tests/unit/fixtures/pragmatic-triple-hop-pots.png'));

  test('HUD: CRÉDITO 99,90 € and APUESTA 2,00 € are read from the screen', async () => {
    test.setTimeout(60_000);
    const ocr = new Ocr();
    try {
      const hud = await readHud(undefined as never, ocr, getMarket('es'), pragmaticLayout, frame());
      expect(hud.credit?.value).toMatchObject({ amount: 99.9, currency: 'EUR' });
      expect(hud.bet?.value).toMatchObject({ amount: 2, currency: 'EUR' });
      expect(hud.credit?.expectedLanguage).toBe(true);
    } finally {
      await ocr.terminate();
    }
  });

  test('spin button is found by image where the player sees it', async () => {
    const target = new TemplateTarget('round arrows button', path.resolve('assets/templates/pragmatic/spin.png'), { circular: true });
    const m = await target.locate(frame());
    expect(m).not.toBeNull();
    expect(m!.x).toBeCloseTo(0.5, 1);
    expect(m!.y).toBeCloseTo(0.83, 1);
  });

  test('bet "−" button is found by image', async () => {
    const target = new TemplateTarget('bet minus button', path.resolve('assets/templates/pragmatic/bet-minus.png'), { circular: true });
    const m = await target.locate(frame());
    expect(m).not.toBeNull();
    expect(m!.x).toBeCloseTo(548 / 1212, 1);
    expect(m!.y).toBeCloseTo(570 / 683, 1);
  });

  test('bet "+" button is found by image, right of the spin button (not mistaken for "−")', async () => {
    const plus = await new TemplateTarget('bet plus button', path.resolve('assets/templates/pragmatic/bet-plus.png'), { circular: true }).locate(frame());
    const minus = await new TemplateTarget('bet minus button', path.resolve('assets/templates/pragmatic/bet-minus.png'), { circular: true }).locate(frame());
    expect(plus).not.toBeNull();
    // measured centre of "+" on this frame: (662.5, 569) px of 1212×683
    expect(Math.abs(plus!.x * 1212 - 662.5)).toBeLessThan(6);
    expect(Math.abs(plus!.y * 683 - 569)).toBeLessThan(6);
    expect(plus!.x).toBeGreaterThan(0.5); // spin button is at x≈0.50
    expect(minus!.x).toBeLessThan(0.5);
  });

  test('live frame: "+" found next to the spin button although a coin crosses its edge (seeded, fine sizes)', async () => {
    // tests/unit/fixtures/pragmatic-plus-live.png: game canvas from a live run (1516×855, BET 0,10 €), where the
    // whole-frame search missed the "+" (coin over its edge, size 1.25× between coarse steps)
    const live = fs.readFileSync(path.resolve('tests/unit/fixtures/pragmatic-plus-live.png'));
    const layout = { frameUrl: /x/, hud: { x: 0, y: 0.8, w: 1, h: 0.2 }, reels: { x: 0, y: 0, w: 1, h: 1 }, spinButton: { x: 0.5, y: 0.8 } };
    const controls = pragmaticControls(layout, {} as Ocr, getMarket('es'));
    const plus = await controls.betUp.locate(live);
    expect(plus, 'bet "+" found on the live frame').not.toBeNull();
    expect(Math.abs(plus!.x * 1516 - 830)).toBeLessThan(6);
    expect(Math.abs(plus!.y * 855 - 713)).toBeLessThan(6);
  });
});

test.describe('intro: press the spin key when the spin/continue button is not recognised', () => {
  const none = { credit: null, bet: null, win: null };
  const label = { value: null, expectedLanguage: true, labelText: 'CREDITO', box: { x: 0, y: 0, w: 1, h: 1 } };

  test('once, after the intro had time to show a HUD or the button', () => {
    expect(shouldPressSpinOnIntro(false, none, 0, INTRO_SPIN_KEY_AFTER_MS - 1)).toBe(false);
    expect(shouldPressSpinOnIntro(false, none, 0, INTRO_SPIN_KEY_AFTER_MS)).toBe(true);
    expect(shouldPressSpinOnIntro(true, none, 0, INTRO_SPIN_KEY_AFTER_MS * 3)).toBe(false);
  });

  test('never once any HUD label is on screen (it would be a real spin)', () => {
    expect(shouldPressSpinOnIntro(false, { ...none, credit: label }, 0, INTRO_SPIN_KEY_AFTER_MS * 3)).toBe(false);
  });
});

test.describe('spin button looks across games (every assets/templates/pragmatic/spin*.png)', () => {
  test.setTimeout(120_000);
  const controls = () => pragmaticControls(pragmaticLayout, undefined as never, getMarket('es'));
  const at = (file: string) => controls().spinButton.locate(fs.readFileSync(path.resolve('tests/unit/fixtures', file)));

  test('plain arrows (Triple Hop Pots): found at the bottom centre', async () => {
    const m = await at('pragmatic-triple-hop-pots.png');
    expect(m).not.toBeNull();
    expect(m!.x).toBeCloseTo(0.5, 1);
    expect(m!.y).toBeCloseTo(0.83, 1);
  });

  test('arrows with a crowned gorilla in the centre: found where it is', async () => {
    const m = await at('pragmatic-crown-spin.png');
    expect(m).not.toBeNull();
    expect(m!.x).toBeCloseTo(0.85, 1);
    expect(m!.y).toBeCloseTo(0.5, 1);
  });

  test('no button on screen: nothing found (no false click)', async () => {
    expect(await at('pragmatic-no-button.png')).toBeNull();
  });
});

