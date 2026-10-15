/** Upper-case, strip accents and collapse whitespace so regexes are robust to OCR and locale. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(s: string): string {
  return normalize(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
