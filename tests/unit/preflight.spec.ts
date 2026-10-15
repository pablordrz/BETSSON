/**
 * Offline tests of the pre-spin guard: a real-money spin only happens when what the player sees is clearly read.
 */
import { expect, test } from '@playwright/test';
import { parseMoney } from '../../src/utils/money';
import { spinPreflight } from '../../src/utils/preflight';

const eur = (t: string) => parseMoney(t);

test.describe('pre-spin guard', () => {
  test('allows the spin when balance, wager and currency are read and affordable', () => {
    const p = spinPreflight({ credit: eur('99,90 €'), bet: eur('2,00 €'), betsson: eur('99,90 €'), currency: 'EUR' });
    expect(p.ok).toBe(true);
    expect(p.reasons).toEqual([]);
  });

  test('blocks when the wager was not read', () => {
    const p = spinPreflight({ credit: eur('99,90 €'), bet: null, betsson: eur('99,90 €'), currency: 'EUR' });
    expect(p.ok).toBe(false);
    expect(p.reasons.join()).toMatch(/BET/);
  });

  test('blocks when the wager is higher than the balance', () => {
    const p = spinPreflight({ credit: eur('1,50 €'), bet: eur('2,00 €'), betsson: eur('1,50 €'), currency: 'EUR' });
    expect(p.ok).toBe(false);
    expect(p.reasons.join()).toMatch(/CREDIT 1\.50 < BET 2\.00/);
  });

  test('blocks when a value has no currency or the wrong one', () => {
    const p = spinPreflight({ credit: eur('99,90'), bet: eur('2,00 €'), betsson: eur('99,90 €'), currency: 'EUR' });
    expect(p.ok).toBe(false);
    expect(p.reasons.join()).toMatch(/CREDIT in no currency/);
  });
});
