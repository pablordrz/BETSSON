import type { BrowserContext } from '@playwright/test';
import type { MarketConfig } from '../config/markets';

/**
 * Extra HTTP headers agreed with Betsson to mark the checker's traffic as test traffic
 * (otherwise the site's fraud detection rejects automated logins).
 * They come ONLY from the environment (EXTRA_HTTP_HEADERS, a JSON object): never in the repo.
 */
export function trustedHeaders(market: MarketConfig): Record<string, string> {
  const raw = process.env[`EXTRA_HTTP_HEADERS_${market.id.toUpperCase()}`] ?? process.env.EXTRA_HTTP_HEADERS;
  if (!raw?.trim()) return {};
  try {
    return Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), String(v)]));
  } catch {
    throw new Error('EXTRA_HTTP_HEADERS is not valid JSON, e.g. {"x-header":"1"}');
  }
}

/**
 * Adds the headers only to requests to Betsson's own domain: sending custom headers to the game provider
 * or third parties would trigger CORS preflights and could break the game.
 */
export async function applyTrustedTraffic(context: BrowserContext, market: MarketConfig): Promise<void> {
  const headers = trustedHeaders(market);
  if (!Object.keys(headers).length) return;
  const domain = new URL(market.baseUrl).hostname.replace(/^www\./, '');
  await context.route(
    (url) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    // allHeaders(), not headers(): the latter omits cookies, and dropping them breaks the session
    async (route) => route.continue({ headers: { ...(await route.request().allHeaders()), ...headers } }),
  );
}
