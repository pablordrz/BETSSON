/** game.readHud: what the player reads in the game before playing. */
import { readGameHud } from '../../steps/game.steps';
import { fmt } from '../../utils/money';
import { must, requirementsFor } from '../step-requirements';

export default requirementsFor(readGameHud, [
  must('CRÉDITO en la moneda del mercado', (r) => r.data.credit.currency === (r.market?.currency ?? 'EUR'), (r) => `CRÉDITO leído: ${fmt(r.data.credit)}`, {
    expected: (r) => r.market?.currency ?? 'EUR',
  }),
  must('APUESTA en la moneda del mercado', (r) => r.data.bet.currency === (r.market?.currency ?? 'EUR'), (r) => `APUESTA leída: ${fmt(r.data.bet)}`, {
    expected: (r) => r.market?.currency ?? 'EUR',
  }),
  must('APUESTA mayor que 0', (r) => r.data.bet.amount > 0, (r) => `APUESTA leída: ${fmt(r.data.bet)}`),
]);
