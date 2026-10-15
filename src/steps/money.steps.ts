/** Money rules: pure checks on what was READ on screen (no interaction). */
import { fmt, moneyEq, round2, type Money } from '../utils/money';
import { spinPreflight, type SpinPreflight } from '../utils/preflight';
import { defineStep } from './step';

/** Before a real-money spin: everything read, in the market currency, and affordable. */
export const preflight = defineStep<{ credit: Money; bet: Money; betsson: Money }, SpinPreflight>({
  id: 'money.preflight',
  title: 'Safe to spin: balance and wager read, market currency, wager affordable',
  async run({ market, log }, input) {
    const p = spinPreflight({ ...input, currency: market.currency });
    log(p.ok ? 'safe to spin' : 'NOT safe to spin', { reasons: p.reasons.join('; ') });
    return { ok: p.ok, detail: `${p.summary}${p.reasons.length ? ` · ${p.reasons.join('; ')}` : ''}`, data: p };
  },
});

/** In-game balance rule: after = before − wager + payout (payout = WIN read on screen, 0 if none). */
export const reconcileGame = defineStep<{ before: Money; bet: Money; after: Money; win: Money | null }, { expected: number; payout: number }>({
  id: 'money.game',
  title: 'In-game balance: after = before − wager + payout',
  async run({ market, log }, { before, bet, after, win }) {
    const payout = win?.amount ?? 0;
    const expected = round2(before.amount - bet.amount + payout);
    const ok = moneyEq(after.amount, expected);
    const observedPayout = round2(after.amount - before.amount + bet.amount);
    log(ok ? 'reconciles' : 'MISMATCH', { before: before.amount, bet: bet.amount, payout, after: after.amount, observedPayout });
    return {
      ok,
      detail: `${before.amount.toFixed(2)} − ${bet.amount.toFixed(2)} + ${payout.toFixed(2)} = ${expected.toFixed(2)} ${market.currency} · read ${fmt(after)}${ok ? '' : ` · observed payout ${observedPayout.toFixed(2)}`}`,
      data: { expected, payout },
    };
  },
});

/** Betsson balance rule over one or many spins: end = start − Σ wagers + Σ payouts (waits for the wallet). */
export const reconcileBetsson = defineStep<{ start: Money; wagered: number; paid: number }, { balance: Money }>({
  id: 'money.betsson',
  title: 'Betsson balance reconciles with wagers and payouts',
  async run({ wallet, market, log }, { start, wagered, paid }) {
    const expected = round2(start.amount - wagered + paid);
    const r = await wallet.waitFor((m) => moneyEq(m.amount, expected));
    log(r.satisfied ? 'reconciles' : 'MISMATCH', { start: start.amount, wagered, paid, expected, read: r.reading.money.amount, polls: r.polls });
    return {
      ok: r.satisfied,
      detail: `${start.amount.toFixed(2)} − ${wagered.toFixed(2)} + ${paid.toFixed(2)} = ${expected.toFixed(2)} ${market.currency} · read ${fmt(r.reading.money)} (${r.polls} reads)`,
      data: { balance: r.reading.money },
      evidence: [{ name: 'balance', png: r.reading.screenshot }],
    };
  },
});

/** The wager shown before the spin is the one used: same BET on screen after, and the debit matches it. */
export const wagerUsed = defineStep<{ betBefore: Money; betAfter: Money | null; before: Money; after: Money; win: Money | null }, { debit: number }>({
  id: 'money.wagerUsed',
  title: 'Displayed wager is the wager used for the spin',
  async run({ log }, { betBefore, betAfter, before, after, win }) {
    const debit = round2(before.amount + (win?.amount ?? 0) - after.amount);
    const ok = !!betAfter && moneyEq(betAfter.amount, betBefore.amount) && moneyEq(debit, betBefore.amount);
    log(ok ? 'wager used = wager shown' : 'MISMATCH', { betBefore: betBefore.amount, betAfter: betAfter?.amount, debit });
    return { ok, detail: `BET shown ${fmt(betBefore)} → after ${fmt(betAfter)} · debited ${debit.toFixed(2)}`, data: { debit } };
  },
});

/** A balance that must NOT change (rejected spin): read before and after. */
export const balanceUnchanged = defineStep<{ what: string; before: Money; after: Money | null }, { after: Money }>({
  id: 'money.unchanged',
  title: 'Balance did not change',
  async run({ log }, { what, before, after }) {
    const ok = !!after && moneyEq(after.amount, before.amount);
    log(ok ? `${what} unchanged` : `${what} CHANGED`, { before: before.amount, after: after?.amount });
    return { ok, detail: `${what}: ${fmt(before)} → ${fmt(after)}`, data: after ? { after } : undefined };
  },
});
