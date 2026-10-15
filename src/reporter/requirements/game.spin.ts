/** game.spin: real money — the spin starts, and it is triggered exactly once. */
import { spin } from '../../steps/game.steps';
import { must, requirementsFor } from '../step-requirements';

export default requirementsFor(spin, [
  must(
    'La tirada se dispara una sola vez',
    (r) => r.data.attempts.filter((a) => a.done).length === 1,
    (r) => `${r.data.attempts.filter((a) => a.done).length} tirada(s) detectada(s): ${r.data.attempts.map((a) => `${a.action} → ${a.done ? 'sí' : 'no'}`).join(', ')}`,
    { expected: '1 tirada' },
  ),
]);
