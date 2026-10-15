import path from 'node:path';
import type { GameLayout } from '../config/game-layout';
import type { MarketConfig } from '../config/markets';
import type { GameScreen } from './game-screen';
import { findTemplate, loadTemplate } from './template';

export type SpinStrategy = 'template' | 'keyboard' | 'click';

export interface SpinAttempt {
  strategy: SpinStrategy;
  done: boolean;
  detail: string;
}

export type AttemptOutcome = () => Promise<{ done: boolean; detail: string }>;

/**
 * Triggers a spin like a player would and lets the CALLER decide from the screen whether it worked.
 * Strategies are tried in order and we stop as soon as the screen confirms a reaction, so a spin is
 * never triggered twice (the outcome check also looks at the credit, not only at motion).
 */
export async function triggerSpin(
  game: GameScreen,
  market: MarketConfig,
  layout: GameLayout,
  outcome: AttemptOutcome,
): Promise<SpinAttempt[]> {
  const attempts: SpinAttempt[] = [];
  for (const strategy of layout.spinStrategies) {
    const performed = await perform(strategy, game, market, layout);
    if (!performed.ok) {
      attempts.push({ strategy, done: false, detail: performed.detail });
      continue;
    }
    const o = await outcome();
    attempts.push({ strategy, done: o.done, detail: `${performed.detail}; ${o.detail}` });
    if (o.done) break;
  }
  return attempts;
}

async function perform(
  strategy: SpinStrategy,
  game: GameScreen,
  market: MarketConfig,
  layout: GameLayout,
): Promise<{ ok: boolean; detail: string }> {
  switch (strategy) {
    case 'template': {
      const file = path.resolve('assets', 'templates', market.gameSlug, 'spin.png');
      const tpl = loadTemplate(file);
      if (!tpl) return { ok: false, detail: `no template at assets/templates/${market.gameSlug}/spin.png` };
      const match = await findTemplate(await game.capture(), tpl);
      if (match.score < 0.85) return { ok: false, detail: `spin button not found visually (best score ${match.score.toFixed(2)})` };
      await game.clickRel(match.x, match.y);
      return { ok: true, detail: `clicked spin button found visually at (${match.x.toFixed(2)}, ${match.y.toFixed(2)}), score ${match.score.toFixed(2)}` };
    }
    case 'keyboard':
      await game.press('Space');
      return { ok: true, detail: 'pressed SPACE' };
    case 'click':
      await game.clickRel(layout.spinButton.x, layout.spinButton.y);
      return { ok: true, detail: `clicked calibrated spin position (${layout.spinButton.x}, ${layout.spinButton.y})` };
  }
}
