import fs from 'node:fs';
import sharp from 'sharp';

/**
 * Minimal template matching (normalised sum of absolute differences on greyscale, downscaled).
 * Used to find the spin button visually instead of clicking fixed coordinates.
 * Templates live in assets/templates/<game-slug>/spin.png (crop it from a calibration screenshot).
 */
const WORK_WIDTH = 360;

async function grey(png: Buffer, width: number) {
  const { data, info } = await sharp(png).greyscale().resize({ width }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

export interface TemplateMatch {
  score: number; // 1 = identical
  x: number; // centre, fraction of screen width
  y: number; // centre, fraction of screen height
}

export async function findTemplate(screen: Buffer, template: Buffer): Promise<TemplateMatch> {
  const sMeta = await sharp(screen).metadata();
  const tMeta = await sharp(template).metadata();
  const factor = WORK_WIDTH / (sMeta.width ?? WORK_WIDTH);
  const S = await grey(screen, WORK_WIDTH);
  const T = await grey(template, Math.max(4, Math.round((tMeta.width ?? 40) * factor)));
  let best = { score: -1, x: 0, y: 0 };
  const step = 2;
  for (let y = 0; y + T.h <= S.h; y += step) {
    for (let x = 0; x + T.w <= S.w; x += step) {
      let sad = 0;
      for (let ty = 0; ty < T.h; ty += 2) {
        const so = (y + ty) * S.w + x;
        const to = ty * T.w;
        for (let tx = 0; tx < T.w; tx += 2) sad += Math.abs(S.data[so + tx] - T.data[to + tx]);
      }
      const samples = Math.ceil(T.h / 2) * Math.ceil(T.w / 2);
      const score = 1 - sad / (255 * samples);
      if (score > best.score) best = { score, x, y };
    }
  }
  return { score: best.score, x: (best.x + T.w / 2) / S.w, y: (best.y + T.h / 2) / S.h };
}

export function loadTemplate(file: string): Buffer | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}
