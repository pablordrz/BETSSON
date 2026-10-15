import path from 'node:path';
import type { GameLayout } from '../../config/game-layout';
import type { MarketConfig } from '../../config/markets';
import { allGameTexts } from '../../config/game-text';
import type { Ocr } from '../ocr';
import { ClickOn, PressKey, type PlayerAction } from './player-action';
import { FirstVisibleTarget, FixedPointTarget, OcrTextTarget, TemplateTarget, type ScreenTarget } from './screen-target';

/**
 * The controls of a game provider, as the player recognises them. Scenarios depend only on this
 * abstraction; supporting another provider means adding another factory, not changing the scenarios.
 */
export interface GameControls {
  /** The spin button as the player recognises it (used to click it and to show it in the evidence). */
  spinButton: ScreenTarget;
  /** Ways to start a spin, in order of preference. Tried one at a time until the screen shows a reaction. */
  spin: PlayerAction[];
  /** The button that takes the game from its intro/splash screen to playable. */
  continueButton: ScreenTarget;
  /** The button that lowers the wager one step ("−"). */
  betDown: ScreenTarget;
}

const TEMPLATES = path.resolve('assets', 'templates');

/**
 * Pragmatic Play: the spin button and the intro "continue" button are the same round icon with two arrows.
 * The player finds it by its look (image), the intro may also say CONTINUAR / PULSA… (text).
 */
export function pragmaticControls(layout: GameLayout, ocr: Ocr, market: MarketConfig): GameControls {
  const arrowsIcon = new TemplateTarget('round arrows button', path.join(TEMPLATES, 'pragmatic', 'spin.png'), { circular: true });
  const continueText = allGameTexts.map((t) => t.continue.source).join('|');
  return {
    spinButton: arrowsIcon,
    spin: [new ClickOn(arrowsIcon), new PressKey('Space'), new ClickOn(new FixedPointTarget('spin button', layout.spinButton))],
    // icon first (Pragmatic intros show it; fast), text as fallback for intros that only say "press to continue"
    continueButton: new FirstVisibleTarget('continue button', [arrowsIcon, new OcrTextTarget('continue text', ocr, market.ocrLang, new RegExp(continueText))]),
    betDown: new TemplateTarget('bet minus button', path.join(TEMPLATES, 'pragmatic', 'bet-minus.png'), { circular: true }),
  };
}
