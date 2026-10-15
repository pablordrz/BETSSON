import type { GameScreen } from '../game-screen';
import type { ScreenTarget } from './screen-target';

export interface ActionResult {
  /** The action could be performed (e.g. the target was visible). Says NOTHING about the game's reaction. */
  performed: boolean;
  detail: string;
}

/** Something a player does to the game. Whether the game reacted is always decided from the screen afterwards. */
export interface PlayerAction {
  readonly name: string;
  perform(game: GameScreen): Promise<ActionResult>;
}

/** Click where a target is SEEN on the current frame. */
export class ClickOn implements PlayerAction {
  readonly name: string;

  constructor(private readonly target: ScreenTarget) {
    this.name = `click ${target.name}`;
  }

  async perform(game: GameScreen): Promise<ActionResult> {
    const match = await this.target.locate(await game.capture());
    if (!match) return { performed: false, detail: `${this.target.name} not visible` };
    await game.clickRel(match.x, match.y);
    return { performed: true, detail: `clicked ${match.detail}` };
  }
}

/** Keyboard shortcut, as players use in most HTML5 slots (SPACE = spin). */
export class PressKey implements PlayerAction {
  readonly name: string;

  constructor(private readonly key: string) {
    this.name = `press ${key}`;
  }

  async perform(game: GameScreen): Promise<ActionResult> {
    await game.press(this.key);
    return { performed: true, detail: `pressed ${this.key}` };
  }
}
