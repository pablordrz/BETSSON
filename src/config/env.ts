/**
 * Secrets come ONLY from environment variables (.env locally, GitHub Environments secrets in CI).
 * Nothing here is ever written to the report.
 */
import type { MarketId } from './markets';

export type AccountKind = 'funded' | 'empty';

export interface Credentials {
  username: string;
  password: string;
}

const first = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
};

/**
 * Looks up BETSSON_<MARKET>_<KIND>_USER / _PASS, falling back to <KIND>_USER / _PASS
 * (used in CI, where each market has its own GitHub Environment with the same secret names).
 */
export function credentialsFor(market: MarketId, kind: AccountKind): Credentials | undefined {
  const M = market.toUpperCase();
  const K = kind.toUpperCase();
  const username = first(`BETSSON_${M}_${K}_USER`, `${K}_USER`);
  const password = first(`BETSSON_${M}_${K}_PASS`, `${K}_PASS`);
  return username && password ? { username, password } : undefined;
}

export function proxyFor(market: MarketId): { server: string; username?: string; password?: string } | undefined {
  const M = market.toUpperCase();
  const server = first(`PROXY_SERVER_${M}`, 'PROXY_SERVER');
  if (!server) return undefined;
  return {
    server,
    username: first(`PROXY_USER_${M}`, 'PROXY_USER'),
    password: first(`PROXY_PASS_${M}`, 'PROXY_PASS'),
  };
}
