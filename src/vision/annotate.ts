import sharp from 'sharp';
import type { Box } from './ocr';

export interface Mark {
  box: Box;
  label: string;
  color?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Draws labelled rectangles on a screenshot so the report shows exactly what was read and where. */
export async function annotate(png: Buffer, marks: Mark[], caption?: string): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const parts = marks.map((m) => {
    const c = m.color ?? '#00e5ff';
    const ty = m.box.y > 22 ? m.box.y - 6 : m.box.y + m.box.h + 16;
    const tw = Math.min(W, 8 + m.label.length * 8);
    return `
      <rect x="${m.box.x}" y="${m.box.y}" width="${m.box.w}" height="${m.box.h}" fill="none" stroke="${c}" stroke-width="3"/>
      <rect x="${m.box.x}" y="${ty - 15}" width="${tw}" height="20" fill="#000" fill-opacity="0.75"/>
      <text x="${m.box.x + 4}" y="${ty}" font-family="Arial, sans-serif" font-size="14" fill="${c}">${esc(m.label)}</text>`;
  });
  if (caption) {
    parts.push(`
      <rect x="0" y="0" width="${W}" height="26" fill="#000" fill-opacity="0.7"/>
      <text x="8" y="18" font-family="Arial, sans-serif" font-size="15" fill="#fff">${esc(caption)}</text>`);
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  return sharp(png)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
