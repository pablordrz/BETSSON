/**
 * Turns raw failure text (Playwright errors, step details) into a "why" a person reads in seconds.
 * Add a case = add one rule. The first matching rule wins; unknown text is returned as is.
 */
interface Rule {
  test: RegExp;
  why: (m: RegExpMatchArray) => string;
}

const seconds = (ms: string) => `${Math.round(Number(ms) / 1000)} s`;
/** getByTestId('play-for-real') / locator('a[href…]') / getByRole('button', { name: 'X' }) → readable target */
const target = (raw: string) =>
  raw
    .replace(/^getByTestId\('([^']+)'\).*$/, '«$1» (data-test-id)')
    .replace(/^getByRole\('(\w+)', \{ name: '([^']+)'.*$/, '$1 «$2»')
    .replace(/^locator\('([^']+)'\).*$/, '«$1»');

export const RULES: Rule[] = [
  {
    test: /Timeout (\d+)ms exceeded[\s\S]*?waiting for (\S+?\(.*?\))(?:\.first\(\))?(?: to be (visible|hidden))?\s*$/m,
    why: (m) => `${target(m[2])} no ${m[3] === 'hidden' ? 'desapareció' : 'apareció'} en pantalla en ${seconds(m[1])}`,
  },
  { test: /Timeout (\d+)ms exceeded/, why: (m) => `se agotó el tiempo de espera (${seconds(m[1])})` },
  { test: /Target page, context or browser has been closed|Target closed|browser has disconnected/i, why: () => 'se cerró el navegador o la pestaña durante el paso' },
  { test: /connectOverCDP|ECONNREFUSED.*9222/i, why: () => 'no hay un Brave abierto con DevTools en el puerto 9222 (npm run browser:fresh)' },
  { test: /net::(ERR_[A-Z_]+)/, why: (m) => `error de red al cargar la página (${m[1]})` },
  { test: /Betsson rejected the login: "([^"]*)"/, why: (m) => `Betsson rechazó el login: «${m[1]}»` },
  { test: /Login did not complete/i, why: () => 'el login no terminó: Betsson no mostró ni el saldo ni un error' },
  { test: /not logged in/i, why: () => 'la cabecera muestra el botón de login: la sesión no está iniciada' },
  { test: /no credentials for the (\w+) account/i, why: (m) => `faltan las credenciales de la cuenta «${m[1]}» en .env` },
  { test: /HUD not readable/i, why: () => 'el OCR no pudo leer CRÉDITO y APUESTA en el juego (¿sigue la pantalla de carga?)' },
  { test: /blank canvas/i, why: () => 'el juego está en negro / sin pintar' },
  { test: /a game-session dialog is still on screen/i, why: () => 'el aviso de sesión de juego sigue en pantalla' },
  { test: /no message on screen/i, why: () => 'no se encontró el mensaje esperado en pantalla' },
  { test: /NOT stable/, why: () => 'dos lecturas seguidas del HUD no coincidieron' },
  { test: /currency ≠ (\w+)/, why: (m) => `la moneda leída no es ${m[1]}` },
  { test: /reels MOVED/, why: () => 'los rodillos giraron cuando no debían' },
  { test: /no visible reaction/, why: () => 'se pulsó spin pero la pantalla no reaccionó' },
];

/** First line that matters of a raw error, without ANSI colours. */
export function firstLine(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) ?? '';
}

export function explain(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '');
  for (const rule of RULES) {
    const m = clean.match(rule.test);
    if (m) return rule.why(m);
  }
  return undefined;
}

/** Diagnosis attached when the page screenshot taken on a failure is a flat colour. */
export const BLANK_PAGE_WHY = 'la página estaba en blanco: Betsson no llegó a pintarla (posible bloqueo anti-bot o carga colgada)';
