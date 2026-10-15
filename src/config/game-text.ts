/**
 * Texts the provider game paints on its canvas, per language. Matched against NORMALISED OCR text
 * (upper-case, accents stripped — see src/utils/text.ts). The market's language pack is the expected one;
 * the others are only used to detect "the game is in the wrong language".
 */
export interface GameText {
  /** HUD label of the in-game balance (word-level, anchored at word start). */
  credit: RegExp;
  /** HUD label of the current wager. */
  bet: RegExp;
  /** HUD label of the last win. */
  win: RegExp;
  /** Intro/splash button that has to be pressed before the game is playable. */
  continue: RegExp;
  /** Insufficient-balance message. */
  insufficientBalance: RegExp;
  /** Free spins / bonus round indicators (payout may not settle in one spin). */
  bonusRound: RegExp;
}

export type Language = 'Spanish' | 'English';

export const gameTexts: Record<Language, GameText> = {
  // CALIBRATE with `npm run calibrate` (Pragmatic Play, Spanish HUD)
  Spanish: {
    credit: /^(CREDITO|SALDO)(?![A-Z])/,
    bet: /^(APUESTA)(?![A-Z])/,
    win: /^(GANANCIAS?|PREMIO|GANADO|GANA)(?![A-Z])/,
    continue: /CONTINUAR|PULSA|PULSE|HAGA CLIC|HAZ CLIC|TOCA/,
    insufficientBalance:
      /INSUFICIENTE|NO (TIENE|TIENES|HAY) (SUFICIENTE )?(SALDO|FONDOS|CREDITO)|SIN (SALDO|FONDOS)|SALDO BAJO/,
    bonusRound: /GIROS? GRATIS|TIRADAS? GRATIS|RONDA DE BONIFICACION|RESPINS?/,
  },
  English: {
    credit: /^(CREDIT|BALANCE)(?![A-Z])/,
    bet: /^(BET|STAKE)(?![A-Z])/,
    win: /^(WIN)(?![A-Z])/,
    continue: /CONTINUE|PRESS ANYWHERE|CLICK TO|TAP TO/,
    insufficientBalance: /INSUFFICIENT|NOT ENOUGH (FUNDS|BALANCE|CREDIT|MONEY)|OUT OF (FUNDS|CREDIT)|LOW BALANCE/,
    bonusRound: /FREE ?SPINS?|BONUS ROUND|RESPINS?/,
  },
};

export const allGameTexts = Object.values(gameTexts);
