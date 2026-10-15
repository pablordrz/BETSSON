/**
 * Market configuration — betsson.es only. Everything site-specific lives here.
 *
 * Betsson.es is built with web components (Shadow DOM). Playwright's getByTestId/getByRole pierce open
 * shadow roots; the test-id attribute is `data-test-id` (set in playwright.config.ts).
 * Test ids below were observed on the public (logged-out) site on 2026-10-15. Values marked CALIBRATE
 * can only be confirmed once logged in: run `npm run calibrate`.
 */
import { gameTexts, type GameText, type Language } from './game-text';

export type MarketId = 'es';
export type CurrencyCode = 'EUR';

export interface MarketConfig {
  id: MarketId;
  /** Label used in reports and as Playwright project name. */
  site: string;
  baseUrl: string;
  /** Pragmatic Play provider page: the scope of the challenge. Games are only taken from here. */
  providerPath: string;
  /** Path of a game page: `${gamePathPrefix}${slug}`. */
  gamePathPrefix: string;
  loginPath: string;
  locale: string;
  timezoneId: string;
  language: Language;
  /** tesseract.js language code. */
  ocrLang: string;
  currency: CurrencyCode;
  /** Slug of the Pragmatic Play game to test (as in /casino/tragaperras-slots/<slug>); empty = first slot on the provider page. */
  gameSlug: string;
  testIds: {
    loginButton: string;
    emailInput: string;
    passwordInput: string;
    loginSubmit: string;
    /** Error banner of the login form. */
    loginError: string;
    gameThumbnail: string;
    gameTitleLink: string;
    showMore: string;
    playForReal: string;
    /** Prefix of the game-detail element on the game page; its suffix names the provider (pragmaticPlay…). */
    gameDetailPrefix: string;
  };
  selectors: {
    /** CALIBRATE: Betsson balance in the header when logged in. */
    headerBalance: string;
    /** Personal data hidden in page screenshots. */
    mask: string[];
  };
  ui: {
    cookiesSettings: RegExp;
    cookiesRejectAll: RegExp;
    /**
     * Regulated "game session" before playing slots (Spain): an optional responsible-gambling notice, then a
     * dialog to choose play time and loss limit. Matched by intent (flexible regexes), not exact strings.
     */
    gameSession: {
      /** Notice shown when the previous game session ended recently. */
      notice: RegExp;
      /** Dialog with the play-time and loss-limit choices. */
      limits: RegExp;
      /** Button that starts the game session (in the notice, the limits dialog and the game placeholder). */
      start: RegExp;
      /** A play-time option (the shortest one is chosen). */
      timeOption: RegExp;
      /** A loss-limit option (the lowest one is chosen). */
      lossOption: RegExp;
    };
  };
  gameText: GameText;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

export const markets: Record<MarketId, MarketConfig> = {
  es: {
    id: 'es',
    site: 'betsson.es',
    baseUrl: env('BASE_URL') ?? 'https://www.betsson.es',
    providerPath: '/casino/proveedores/pragmatic-play',
    gamePathPrefix: '/casino/tragaperras-slots/',
    loginPath: '/inicio',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    language: 'Spanish',
    ocrLang: 'spa',
    currency: 'EUR',
    gameSlug: env('GAME_SLUG') ?? '',
    testIds: {
      loginButton: 'login-button',
      emailInput: 'email-input',
      passwordInput: 'password-input',
      loginSubmit: 'account-login-btn-1',
      loginError: 'account-fabric-login-error',
      gameThumbnail: 'game-thumbnail',
      gameTitleLink: 'game-thumbnail-title',
      showMore: 'show-more.button',
      playForReal: 'play-for-real',
      gameDetailPrefix: 'game-detail-',
    },
    selectors: {
      // Calibrated 2026-10-15 (logged in): header "Saldo" button, e.g. "99,90 €"
      headerBalance: '[data-test-id="balance-button"]',
      mask: ['[data-test-id*="username" i]', '[data-test-id*="user-name" i]', '[class*="username" i]', '[class*="user-name" i]'],
    },
    ui: {
      cookiesSettings: /^configuraci[oó]n de cookies$/i,
      cookiesRejectAll: /^rechazar(las)? todas?$/i,
      gameSession: {
        notice: /finalizaste tu sesi[oó]n|juego (m[aá]s )?seguro|juegas de forma segura/i,
        limits: /tiempo de juego|l[ií]mite de (p[eé]rdidas|tiempo)|l[ií]mites? de (la )?sesi[oó]n/i,
        start: /^(iniciar( una nueva)? sesi[oó]n|empezar a jugar|continuar|jugar)$/i,
        timeOption: /^\d+\s*(min|minutos?|horas?)$/i,
        lossOption: /^\d+\s*%/,
      },
    },
    gameText: gameTexts.Spanish,
  },
};

export function getMarket(id: MarketId): MarketConfig {
  const m = markets[id];
  if (!m) throw new Error(`Unknown market "${id}"`);
  return m;
}
