/**
 * Opens a normal Brave (or Chrome) window with a dedicated profile and a local DevTools port, so the checker
 * can attach to it (CDP_URL) instead of launching an automated browser — Betsson's fraud detection rejects those.
 *   npm run browser                      (Brave if installed, else Chrome)
 *   BROWSER_PATH="C:\...\chrome.exe" npm run browser
 * The profile lives in .cache/browser-profile (gitignored). Keep the window open while the tests run.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(new URL(process.env.CDP_URL || 'http://127.0.0.1:9222').port || 9222);
const candidates = [
  process.env.BROWSER_PATH,
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/brave-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const exe = candidates.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('No Brave/Chrome found: set BROWSER_PATH');
  process.exit(1);
}
/** Closes a test browser still listening on the DevTools port (otherwise "fresh" would reuse it). */
async function closeRunningBrowser() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    const { webSocketDebuggerUrl } = await res.json();
    await new Promise((resolve) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      ws.onclose = resolve;
      ws.onerror = resolve;
      setTimeout(resolve, 3000);
    });
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const alive = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
      if (!alive) break;
    }
    await new Promise((r) => setTimeout(r, 500)); // let it release the profile files
  } catch {
    // nothing running
  }
}

const profile = path.resolve('.cache', 'browser-profile');
(async () => {
  await closeRunningBrowser();
  // --fresh: start from an empty profile (no cookies, no session) so the checker does the whole journey itself
  if (process.argv.includes('--fresh')) fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  // Fixed window size: Betsson shows its desktop header (balance) and the game renders at a stable size for OCR.
  const args = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', '--window-position=0,0', 'https://www.betsson.es/inicio'];
  spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
  console.log(`Opened ${path.basename(exe)} with DevTools on http://127.0.0.1:${port} (set CDP_URL to that in .env)`);
})();
