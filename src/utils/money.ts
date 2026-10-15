import type { CurrencyCode } from '../config/markets';

export interface Money {
  amount: number;
  currency: CurrencyCode | null;
  raw: string;
}

const CURRENCIES: Array<[CurrencyCode, RegExp]> = [['EUR', /€|\bEUR\b|\bEUROS?\b/i]];

export function detectCurrency(text: string): CurrencyCode | null {
  for (const [code, re] of CURRENCIES) if (re.test(text)) return code;
  return null;
}

/**
 * Parses an amount written either "1.234,56" (es-ES) or "1,234.56" (Pragmatic often uses this),
 * also "10,5", "1.000". Returns null if there is no number.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0'); // OCR: O ↔ 0
  const m = cleaned.match(/\d[\d.,]*/);
  if (!m) return null;
  const num = m[0].replace(/[.,]+$/, '');
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep === -1) return Number(num);
  const decimals = num.length - lastSep - 1;
  if (decimals === 3 && (lastDot === -1 || lastComma === -1)) {
    // a single kind of separator followed by 3 digits → thousands separator ("1.000", "1,000")
    return Number(num.replace(/[.,]/g, ''));
  }
  const intPart = num.slice(0, lastSep).replace(/[.,]/g, '');
  return Number(`${intPart}.${num.slice(lastSep + 1)}`);
}

export function parseMoney(text: string): Money | null {
  const amount = parseAmount(text);
  if (amount === null || Number.isNaN(amount)) return null;
  return { amount: round2(amount), currency: detectCurrency(text), raw: text.trim() };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Equal within one cent (OCR + rounding tolerance). */
export function moneyEq(a: number, b: number, toleranceCents = 1): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= toleranceCents;
}

export function fmt(m: Money | number | null | undefined, currency?: string | null): string {
  if (m === null || m === undefined) return 'not visible';
  if (typeof m === 'number') return `${m.toFixed(2)}${currency ? ' ' + currency : ''}`;
  return `${m.amount.toFixed(2)} ${m.currency ?? '(no currency symbol)'} [read: "${m.raw}"]`;
}
