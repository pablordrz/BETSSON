import path from 'node:path';
import sharp from 'sharp';
import { createWorker, PSM, type Worker } from 'tesseract.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  /** In pixels of the ORIGINAL (un-scaled) image, plus the given offset. */
  box: Box;
}

export interface OcrRow {
  text: string;
  words: OcrWord[];
  box: Box;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  rows: OcrRow[];
}

export interface OcrOptions {
  /** Upscale factor before OCR (small HUD text reads much better at 2–3x). */
  scale?: number;
  /** Added to every box, e.g. the position of a crop inside the full canvas. */
  offset?: { x: number; y: number };
  minConfidence?: number;
  /** Keep only pixels brighter than this (0–255) as text: game HUD labels/amounts are bright on busy art. */
  brightTextThreshold?: number;
}

/**
 * Thin wrapper over tesseract.js: one worker per language, image pre-processing tuned for
 * game HUDs (light text on dark backgrounds), and our own row grouping.
 */
export class Ocr {
  private workers = new Map<string, Promise<Worker>>();

  private worker(lang: string): Promise<Worker> {
    let w = this.workers.get(lang);
    if (!w) {
      w = (async () => {
        const worker = await createWorker(lang, 1, {
          cachePath: path.resolve('.cache', 'tesseract'),
          langPath: localLangPath(lang),
        });
        // Sparse text: game screens are not documents
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        return worker;
      })();
      this.workers.set(lang, w);
    }
    return w;
  }

  async read(png: Buffer, lang: string, opts: OcrOptions = {}): Promise<OcrResult> {
    const scale = opts.scale ?? 2;
    const off = opts.offset ?? { x: 0, y: 0 };
    const minConf = opts.minConfidence ?? 30;
    const prepared = await preprocess(png, scale, opts.brightTextThreshold);
    const worker = await this.worker(lang);
    const { data } = await worker.recognize(prepared);
    const words: OcrWord[] = (data.words ?? [])
      .filter((w) => w.text.trim() && w.confidence >= minConf)
      .map((w) => ({
        text: w.text.trim(),
        confidence: w.confidence,
        box: {
          x: w.bbox.x0 / scale + off.x,
          y: w.bbox.y0 / scale + off.y,
          w: (w.bbox.x1 - w.bbox.x0) / scale,
          h: (w.bbox.y1 - w.bbox.y0) / scale,
        },
      }));
    const rows = groupRows(words);
    return { text: rows.map((r) => r.text).join('\n'), words, rows };
  }

  async terminate(): Promise<void> {
    for (const w of this.workers.values()) await (await w).terminate().catch(() => undefined);
    this.workers.clear();
  }
}

/** Language data shipped as npm packages (@tesseract.js-data/<lang>) → no CDN download at runtime. */
function localLangPath(lang: string): string | undefined {
  if (lang.includes('+')) return undefined; // multi-language: fall back to the default CDN
  try {
    return path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int');
  } catch {
    return undefined;
  }
}

/**
 * Greyscale, upscale, stretch contrast, and invert dark backgrounds (Tesseract prefers dark-on-light).
 * With brightTextThreshold: binarise instead (only bright text survives).
 */
export async function preprocess(png: Buffer, scale: number, brightTextThreshold?: number): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  if (brightTextThreshold !== undefined) {
    // bright text → black on white, background (whatever the artwork) → white
    return sharp(png)
      .greyscale()
      .resize({ width: Math.round((meta.width ?? 100) * scale), kernel: 'lanczos3' })
      .threshold(brightTextThreshold)
      .negate({ alpha: false })
      .png()
      .toBuffer();
  }
  const stats = await sharp(png).greyscale().stats();
  const mean = stats.channels[0].mean;
  let img = sharp(png)
    .greyscale()
    .resize({ width: Math.round((meta.width ?? 100) * scale), kernel: 'lanczos3' })
    .normalise();
  if (mean < 128) img = img.negate({ alpha: false });
  return img.png().toBuffer();
}

/** Group words into visual rows (same baseline), each sorted left→right. */
export function groupRows(words: OcrWord[]): OcrRow[] {
  const sorted = [...words].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2));
  const rows: { words: OcrWord[]; cy: number; h: number }[] = [];
  for (const w of sorted) {
    const cy = w.box.y + w.box.h / 2;
    const row = rows.find((r) => Math.abs(r.cy - cy) < Math.max(r.h, w.box.h) * 0.6);
    if (row) {
      row.words.push(w);
      row.cy = (row.cy * (row.words.length - 1) + cy) / row.words.length;
      row.h = Math.max(row.h, w.box.h);
    } else rows.push({ words: [w], cy, h: w.box.h });
  }
  return rows.map((r) => {
    const ws = r.words.sort((a, b) => a.box.x - b.box.x);
    return { words: ws, text: ws.map((w) => w.text).join(' '), box: unionBox(ws.map((w) => w.box)) };
  });
}

export function unionBox(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
