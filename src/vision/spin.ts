import type { PlayerAction } from './controls/player-action';
import type { GameScreen } from './game-screen';

export interface SpinAttempt {
  action: string;
  done: boolean;
  detail: string;
}

export type AttemptOutcome = () => Promise<{ done: boolean; detail: string }>;

/**
 * Triggers a spin like a player would and lets the CALLER decide from the screen whether it worked.
 * Actions are tried in order and we stop as soon as the screen confirms a reaction, so a spin is
 * never triggered twice (the outcome check also looks at the credit, not only at motion).
 */
export async function triggerSpin(game: GameScreen, actions: PlayerAction[], outcome: AttemptOutcome): Promise<SpinAttempt[]> {
  const attempts: SpinAttempt[] = [];
  for (const action of actions) {
    const result = await action.perform(game);
    if (!result.performed) {
      attempts.push({ action: action.name, done: false, detail: result.detail });
      continue;
    }
    const o = await outcome();
    attempts.push({ action: action.name, done: o.done, detail: `${result.detail}; ${o.detail}` });
    if (o.done) break;
  }
  return attempts;
}
