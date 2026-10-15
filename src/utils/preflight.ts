import type { CurrencyCode } from '../config/markets';
import { fmt, type Money } from './money';

export interface SpinPreflightInput {
  /** In-game balance read on screen (stable across consecutive reads). */
  credit: Money | null | undefined;
  /** Wager read on screen. */
  bet: Money | null | undefined;
  /** Betsson balance read in Betsson's header. */
  betsson: Money | null | undefined;
  currency: CurrencyCode;
}

export interface SpinPreflight {
  /** Safe to spend one real-money spin: every value read, in the market currency, and enough funds. */
  ok: boolean;
  /** Why not (empty when ok). */
  reasons: string[];
  summary: string;
}

/**
 * Guard BEFORE a real-money spin: the checker only spins when it has clearly read what the player sees
 * (balance, wager, currency) and the spin is affordable — so a misread can never cause an unexpected debit.
 */
export function spinPreflight({ credit, bet, betsson, currency }: SpinPreflightInput): SpinPreflight {
  const reasons: string[] = [];
  if (!credit) reasons.push('in-game balance (CREDIT) not read');
  if (!bet) reasons.push('wager (BET) not read');
  if (!betsson) reasons.push('Betsson balance not read');
  if (bet && bet.amount <= 0) reasons.push(`wager read as ${bet.amount}`);
  for (const [name, m] of [['CREDIT', credit], ['BET', bet], ['Betsson balance', betsson]] as const) {
    if (m && m.currency !== currency) reasons.push(`${name} in ${m.currency ?? 'no currency'} instead of ${currency}`);
  }
  if (credit && bet && credit.amount < bet.amount) reasons.push(`CREDIT ${credit.amount.toFixed(2)} < BET ${bet.amount.toFixed(2)}`);
  if (betsson && bet && betsson.amount < bet.amount) reasons.push(`Betsson balance ${betsson.amount.toFixed(2)} < BET ${bet.amount.toFixed(2)}`);
  return {
    ok: reasons.length === 0,
    reasons,
    summary: `CREDIT ${fmt(credit)} · BET ${fmt(bet)} · Betsson ${fmt(betsson)}`,
  };
}
