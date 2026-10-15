/** site.goToGame: the game opened is a Pragmatic Play game (scope of the challenge). */
import { goToGame } from '../../steps/site.steps';
import { must, requirementsFor } from '../step-requirements';

export default requirementsFor(goToGame, [
  must('Se abrió la ficha de un juego', (r) => !!r.data.slug, (r) => `juego: ${r.data.slug ?? 'ninguno'}`, { expected: 'slug del juego' }),
  must('El juego es de Pragmatic Play', (r) => /pragmatic/i.test(r.data.gameDetailId ?? ''), (r) => `ficha: ${r.data.gameDetailId ?? 'no encontrada'}`, {
    expected: 'game-detail-pragmaticPlay…',
  }),
]);
