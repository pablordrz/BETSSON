import fs from 'node:fs';
import path from 'node:path';
import type { GameLayout } from '../../config/game-layout';
import type { MarketConfig } from '../../config/markets';
import { allGameTexts } from '../../config/game-text';
import type { Ocr } from '../ocr';
import { HoughCircleTarget } from './hough-target';
import { ClickOn, PressKey, type PlayerAction } from './player-action';
import { FirstVisibleTarget, FixedPointTarget, NextToTarget, OcrTextTarget, TemplateTarget, type ScreenTarget } from './screen-target';

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
  /** The button that raises the wager one step ("+"). */
  betUp: ScreenTarget;
  /** The "X" that closes the game's own panels (bet settings, info…). */
  closeButton: ScreenTarget;
}

const TEMPLATES = path.resolve('assets', 'templates');

/**
 * Pragmatic Play: the spin button and the intro "continue" button are the same round icon with two arrows.
 * The player finds it by its look (image), the intro may also say CONTINUAR / PULSA… (text).
 *
 * Cascade for the spin button (benchmark on real frames: docs/vision-approaches.md):
 *   1. template ZNCC — the exact Pragmatic icon; most precise. First search seeded by Hough (where + size:
 *      2.7 s → 0.4 s median), then ms-fast re-checks where it was
 *   2. circle Hough  — any big round button with an icon, no template; same hit rate, ~50× faster on a first search
 *   3. SPACE key     — players' shortcut
 *   4. calibrated position — last resort; the screen still has to confirm the spin started
 */
export function pragmaticControls(layout: GameLayout, ocr: Ocr, market: MarketConfig): GameControls {
  const roundButton = new HoughCircleTarget('round spin button (Hough)');
  // Same two arrows in every game, the centre changes (empty, a logo, a gorilla with a crown…): one template per
  // look, the best match wins. Add a new look as assets/templates/pragmatic/spin-<name>.png.
  const spinLooks = fs.readdirSync(path.join(TEMPLATES, 'pragmatic')).filter((f) => /^spin.*\.png$/.test(f));
  // Looks whose inside shows the game's own artwork (Helios Triple Sun: arrows around a sun) are less distinctive
  // than a plain disk, so they must match more strictly (measured: 0.71 on artwork with no button at the usual 0.70)
  const ARTWORK_INSIDE = new Set(['spin-helios.png']);
  const toPath = (f: string) => path.join(TEMPLATES, 'pragmatic', f);
  // first search seeded by Hough (where + size), confirmed by the templates (that it IS the Pragmatic icon)
  // minScale 0.7: real spin buttons match at 1.0–1.35 (fixed Brave window); a tiny template matches artwork (false click)
  const plainLooks = new TemplateTarget('round arrows button', spinLooks.filter((f) => !ARTWORK_INSIDE.has(f)).map(toPath), { circular: true, seed: roundButton, minScale: 0.7 });
  const artworkLooks = spinLooks.filter((f) => ARTWORK_INSIDE.has(f)).map(toPath);
  const arrowsIcon: ScreenTarget = artworkLooks.length
    ? new FirstVisibleTarget('round arrows button', [
        plainLooks,
        new TemplateTarget('round arrows button (artwork inside)', artworkLooks, { circular: true, seed: roundButton, minScale: 0.8, minScore: 0.82 }),
      ])
    : plainLooks;
  const continueText = allGameTexts.map((t) => t.continue.source).join('|');
  const spinButton = new FirstVisibleTarget('spin button', [arrowsIcon, roundButton]);
  // Pragmatic puts bet "−" / "+" just left / right of the spin button (≈4.5 % of the width): look for them THERE,
  // with fine sizes — a dark disk with a thin sign is easy to miss with coarse steps or when a coin crosses its edge
  const leftOfSpin = new NextToTarget('left of the spin button', spinButton, { dx: -0.045, dy: 0 });
  const rightOfSpin = new NextToTarget('right of the spin button', spinButton, { dx: 0.045, dy: 0 });
  return {
    spinButton,
    spin: [
      new ClickOn(arrowsIcon),
      new ClickOn(roundButton),
      new PressKey('Space'),
      new ClickOn(new FixedPointTarget('spin button', layout.spinButton)),
    ],
    // icon first (Pragmatic intros show it; fast), text for intros that only say "press to continue", then any
    // big round button (pressed once at most, only while no HUD is visible — see game.enter)
    continueButton: new FirstVisibleTarget('continue button', [
      arrowsIcon,
      new OcrTextTarget('continue text', ocr, market.ocrLang, new RegExp(continueText)),
      roundButton,
    ]),
    betDown: new TemplateTarget('bet minus button', path.join(TEMPLATES, 'pragmatic', 'bet-minus.png'), { circular: true, seed: leftOfSpin }),
    betUp: new TemplateTarget('bet plus button', path.join(TEMPLATES, 'pragmatic', 'bet-plus.png'), { circular: true, seed: rightOfSpin }),
    // a thin white "X" on a dark panel (Helios Triple Sun's bet panel). Not circular: the X reaches the corners.
    closeButton: new TemplateTarget('panel close button (X)', path.join(TEMPLATES, 'pragmatic', 'close-x.png'), { minScore: 0.8, minScale: 0.6, maxScale: 1.8 }),
  };
}
