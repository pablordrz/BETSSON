import { sleep } from '../utils/text';
import type { ScreenTarget } from './controls/screen-target';
import type { GameScreen } from './game-screen';

/**
 * Closes the game's own panels (bet settings, info, paytable…) the way a player does: find the close "X" by image
 * and press it, then check on screen that it is gone. Some games open a bet panel when a control next to the spin
 * button is pressed (e.g. Helios Triple Sun), and an open panel hides the reels and the HUD.
 * Falls back to the Escape key once. Returns what was done (empty = no panel was open).
 */
export async function closeOpenPanels(
  game: GameScreen,
  closeButton: ScreenTarget,
  log: (message: string, data?: Record<string, unknown>) => void = () => undefined,
  maxPanels = 3,
): Promise<{ actions: string[]; stillOpen: boolean }> {
  const actions: string[] = [];
  for (let i = 0; i < maxPanels; i++) {
    const x = await closeButton.locate(await game.capture());
    if (!x) return { actions, stillOpen: false };
    await game.clickRel(x.x, x.y);
    actions.push(`panel closed with its "X" (${x.detail})`);
    log('panel open: "X" pressed', { how: x.detail });
    await sleep(700);
  }
  // still an "X" on screen after several presses: try the Escape key once
  if (await closeButton.locate(await game.capture())) {
    await game.press('Escape');
    await sleep(700);
    actions.push('Escape pressed');
    log('panel still open: Escape pressed');
  }
  const stillOpen = !!(await closeButton.locate(await game.capture()));
  return { actions, stillOpen };
}
