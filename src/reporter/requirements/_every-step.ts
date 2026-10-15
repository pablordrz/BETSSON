/** What EVERY step must satisfy, including steps added later by anyone. */
import { firstLine } from '../explain';
import { forEveryStep, must } from '../step-requirements';

export default forEveryStep([
  must('El paso termina sin errores', (r) => !r.error, (r) => firstLine(r.error ?? ''), { expected: 'sin excepciones', blocking: true }),
  // catch-all: when a more specific requirement explains the failure, this one is not shown
  must('Valida en pantalla lo que promete', (r) => r.outcome.ok, (r) => r.outcome.detail, { expected: (r) => r.step.title, fallback: true }),
  must('Entrega sus datos al siguiente paso', (r) => !r.outcome.ok || r.outcome.data !== undefined, () => 'validó, pero no devolvió datos', { expected: 'datos del paso' }),
]);
