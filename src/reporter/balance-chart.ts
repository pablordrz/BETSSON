import sharp from 'sharp';

export interface BalancePoint {
  label: string;
  balance: number;
  /** Payout of the spin that led to this point (marks winning spins). */
  payout?: number;
}

/** Line chart of the in-game balance spin by spin (PNG for the report). */
export async function balanceChart(points: BalancePoint[], title: string, currency: string): Promise<Buffer> {
  const W = 900;
  const H = 360;
  const pad = { l: 70, r: 20, t: 40, b: 50 };
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / span;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const ticks = [max, (max + min) / 2, min];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial, sans-serif">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad.l}" y="24" font-size="16" font-weight="bold" fill="#222">${escape(title)}</text>
  ${ticks
    .map(
      (v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e5e5"/>
  <text x="${pad.l - 8}" y="${y(v) + 4}" font-size="12" text-anchor="end" fill="#555">${v.toFixed(2)} ${currency}</text>`,
    )
    .join('\n  ')}
  <path d="${path}" fill="none" stroke="#1565c0" stroke-width="2.5"/>
  ${points
    .map(
      (p, i) => `<circle cx="${x(i)}" cy="${y(p.balance)}" r="${p.payout ? 6 : 4}" fill="${p.payout ? '#2e7d32' : '#1565c0'}"/>
  <text x="${x(i)}" y="${H - pad.b + 20}" font-size="11" text-anchor="middle" fill="#555">${escape(p.label)}</text>`,
    )
    .join('\n  ')}
  <text x="${W - pad.r}" y="${H - 8}" font-size="11" text-anchor="end" fill="#2e7d32">● winning spin</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
