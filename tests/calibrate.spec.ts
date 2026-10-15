/**
 * Calibration run — NO SPIN, no money moved. Dumps what the checker sees so you can tune
 * src/config/markets.ts and src/config/game-layout.ts:
 *   npm run calibrate:com   (or calibrate:pe)
 * Output: calibration/<market>/ (gitignored) + attachments in the Playwright report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { annotate } from '../src/vision/annotate';
import { cropRel, imageSize } from '../src/vision/game-screen';
import { readHud } from '../src/vision/hud';
import { BetssonSite } from '../src/pages/betsson-site';
import { test } from './fixtures';

test.use({ account: 'funded' });

test('Calibrate — what the checker sees', async ({ page, site, ocr, market, layout }, testInfo) => {
  test.setTimeout(10 * 60_000);
  const dir = path.resolve('calibration', market.id);
  fs.mkdirSync(dir, { recursive: true });
  const save = async (name: string, body: Buffer | string, contentType: string) => {
    fs.writeFileSync(path.join(dir, name), body);
    await testInfo.attach(name, { body, contentType });
  };

  // Betsson header: which DOM elements contain a balance? (for selectors.headerBalance)
  // If the player already has the game open in this tab (CDP mode), use another tab: never navigate it away.
  const lobby = site.openGameSlug() ? await page.context().newPage() : page;
  await new BetssonSite(lobby, market).open(market.providerPath);
  await lobby.waitForTimeout(5000);
  // Betsson.es uses Shadow DOM → walk every shadow root
  const candidates = await lobby.evaluate(() => {
    const re = /(€|EUR)\s?\d|\d[\d.,]*\s?(€|EUR)/;
    const walk = (root: Document | ShadowRoot, out: HTMLElement[] = []): HTMLElement[] => {
      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, out);
      }
      return out;
    };
    return walk(document)
      .filter((el) => el.childElementCount <= 2 && re.test(el.textContent ?? '') && (el.textContent ?? '').trim().length < 40)
      .slice(0, 40)
      .map((el) => {
        const host = (el.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
        return {
          tag: el.tagName.toLowerCase(),
          testId: el.getAttribute('data-test-id'),
          closestTestId: el.closest('[data-test-id]')?.getAttribute('data-test-id') ?? null,
          shadowHost: host ? `${host.tagName.toLowerCase()}[data-test-id=${host.getAttribute('data-test-id')}]` : null,
          classes: el.className?.toString().slice(0, 120),
          text: (el.textContent ?? '').trim(),
          top: Math.round(el.getBoundingClientRect().top),
        };
      });
  });
  await save('betsson-balance-candidates.json', JSON.stringify(candidates, null, 2), 'application/json');
  if (lobby !== page) {
    await lobby.close();
    await page.bringToFront();
  }

  const { game, provider } = await site.openGame(layout);
  await save('provider.json', JSON.stringify(provider, null, 2), 'application/json');
  await save('frames.json', JSON.stringify(page.frames().map((f) => f.url()), null, 2), 'application/json');

  // Let the intro load, then dump OCR of the whole canvas and of the HUD, every 15s for ~1 minute.
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(15_000);
    const frame = await game.capture();
    await save(`canvas-${i}.png`, frame, 'image/png');
    const full = await ocr.read(frame, market.ocrLang, { scale: 1.5 });
    await save(`canvas-${i}-ocr.json`, JSON.stringify(full.rows.map((r) => ({ text: r.text, box: r.box })), null, 2), 'application/json');
    const hud = await readHud(game, ocr, market, layout, frame);
    const reels = await cropRel(frame, layout.reels);
    const marks = [
      ...full.rows.map((r) => ({ box: r.box, label: r.text.slice(0, 40), color: '#ffea00' })),
      ...hud.marks,
      { box: reels.box, label: 'reels region', color: '#d500f9' },
    ];
    const sb = { x: layout.spinButton.x, y: layout.spinButton.y };
    const size = await imageSize(frame);
    marks.push({ box: { x: sb.x * size.width - 30, y: sb.y * size.height - 30, w: 60, h: 60 }, label: 'spin fallback', color: '#ff1744' });
    await save(`canvas-${i}-annotated.png`, await annotate(frame, marks, `calibration ${market.site} #${i}`), 'image/png');
    await save(`canvas-${i}-hud.json`, JSON.stringify({ credit: hud.credit, bet: hud.bet, win: hud.win, hudText: hud.ocr.text }, null, 2), 'application/json');
    // crop around the spin fallback → copy to assets/templates/<game>/spin.png if it is the button
    const crop = await cropRel(frame, { x: sb.x - 0.04, y: sb.y - 0.07, w: 0.08, h: 0.14 });
    await save(`spin-candidate-${i}.png`, crop.png, 'image/png');
  }
});
