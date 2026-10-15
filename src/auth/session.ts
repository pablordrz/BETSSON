import fs from 'node:fs';
import path from 'node:path';
import type { AccountKind } from '../config/env';
import type { MarketId } from '../config/markets';
import type { StorageState } from './login';

/** Sessions saved by `npm run login` (manual login). Gitignored: they are as sensitive as a password. */
export const storageStatePath = (market: MarketId, account: AccountKind) => path.resolve('.auth', `${market}-${account}.json`);

/** DevTools endpoint of a browser opened by the player (`npm run browser`), e.g. http://127.0.0.1:9222. */
export const cdpUrl = () => process.env.CDP_URL?.trim() || undefined;

export function savedSession(market: MarketId, account: AccountKind): StorageState | undefined {
  const file = storageStatePath(market, account);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
}
