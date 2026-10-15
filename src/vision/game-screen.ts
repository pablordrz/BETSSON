import type { Frame, Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import type { Rel } from '../config/game-layout';
import type { Box } from './ocr';

/**
 * The provider game as the player sees it: a canvas inside (possibly nested) iframes.
 * We never read the game's DOM/state — only pixels — and we interact with mouse/keyboard
 * like a player would.
 */
export class GameScreen {
  private constructor(
    readonly page: Page,
    readonly frame: Frame,
    readonly canvas: Locator,
  ) {}

  /** Waits until a large canvas is visible in the provider iframe (falls back to any frame). */
  static async attach(page: Page, frameUrl: RegExp, timeoutMs = 120_000): Promise<GameScreen> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const frames = page.frames();
      const preferred = frames.filter((f) => frameUrl.test(f.url()));
      const ordered = Date.now() > deadline - timeoutMs / 2 ? [...preferred, ...frames] : preferred;
      for (const f of ordered) {
        const canvases = f.locator('canvas');
        const n = await canvases.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const c = canvases.nth(i);
          const b = await c.boundingBox().catch(() => null);
          if (b && b.width > 300 && b.height > 200) return new GameScreen(page, f, c);
        }
      }
      await page.waitForTimeout(1000);
    }
    const urls = page.frames().map((f) => f.url()).join('\n  ');
    throw new Error(`Game canvas not found within ${timeoutMs / 1000}s. Frames:\n  ${urls}`);
  }

  /** Screenshot of the canvas exactly as rendered on screen. */
  async capture(): Promise<Buffer> {
    return this.canvas.screenshot({ timeout: 15_000 });
  }

  /** Screenshot of a region of the canvas. Returns the crop and its box in canvas pixels. */
  async captureRegion(rel: Rel, full?: Buffer): Promise<{ png: Buffer; box: Box; full: Buffer }> {
    const png = full ?? (await this.capture());
    const { png: crop, box } = await cropRel(png, rel);
    return { png: crop, box, full: png };
  }

  /** Click at a position given as a fraction of the canvas. */
  async clickRel(x: number, y: number): Promise<void> {
    const b = await this.canvas.boundingBox();
    if (!b) throw new Error('Game canvas is not visible');
    await this.page.mouse.click(b.x + x * b.width, b.y + y * b.height);
  }

  /** Click at a pixel position of a captured canvas image (e.g. an OCR word box). */
  async clickImagePoint(px: number, py: number, imageWidth: number, imageHeight: number): Promise<void> {
    await this.clickRel(px / imageWidth, py / imageHeight);
  }

  /** Keyboard input to the game frame (players can spin with SPACE in most HTML5 slots). */
  async press(key: string): Promise<void> {
    await this.frame.evaluate(() => window.focus()).catch(() => undefined);
    await this.page.keyboard.press(key);
  }

  async bringToFront(): Promise<void> {
    await this.page.bringToFront();
  }
}

export async function cropRel(png: Buffer, rel: Rel): Promise<{ png: Buffer; box: Box }> {
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const box = {
    x: Math.max(0, Math.round(rel.x * W)),
    y: Math.max(0, Math.round(rel.y * H)),
    w: Math.max(1, Math.min(W - Math.round(rel.x * W), Math.round(rel.w * W))),
    h: Math.max(1, Math.min(H - Math.round(rel.y * H), Math.round(rel.h * H))),
  };
  const out = await sharp(png).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).png().toBuffer();
  return { png: out, box };
}

export async function imageSize(png: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(png).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/** A canvas that failed to render (WebGL off, black screen) has almost no variance. */
export async function isBlank(png: Buffer): Promise<{ blank: boolean; stdev: number }> {
  const s = await sharp(png).stats();
  const stdev = Math.max(...s.channels.slice(0, 3).map((c) => c.stdev));
  return { blank: stdev < 6, stdev };
}
