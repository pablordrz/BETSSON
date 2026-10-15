# Intelligent Game Validation — Betsson × Malackathon 2026

Validates **Pragmatic Play** games on **betsson.es** (Spanish · EUR) in **Real Play** the way a player does:
by **reading the screen**. Games are only taken from the provider page
<https://www.betsson.es/casino/proveedores/pragmatic-play>. The game is a canvas, so the checker never relies on the
game's DOM or on "I clicked Spin" — it proves each step from pixels.

| Player question | How the checker answers it |
|---|---|
| Is this a Pragmatic Play game? | Found on the provider page, and the game page's `game-detail-pragmaticPlay…` element |
| Is the game there? | Canvas located in the provider iframe and **not blank** (pixel variance) |
| What are my balance, wager, currency, language? | **OCR** of the HUD (`CRÉDITO` / `APUESTA` / `GANANCIA`) → amount + `€` + label language |
| Did the spin actually start? | **Motion detection** on the reels: change above the *measured idle-animation noise* |
| Did it finish? | Reels **settle** (N stable frames) and the HUD values stop changing |
| Was I charged correctly? | `in-game after = before − wager + payout`, payout = **win read on screen** |
| Does Betsson agree? | Betsson header balance polled until `after = before − wager + payout` |
| No money → what do I see? | OCR of the **insufficient-balance message** in Spanish; both balances unchanged |

Bonus cross-checks (reported as `INFO`, never the proof): provider server responses vs. OCR, in-game credit vs. Betsson balance.

## Quick start

```bash
npm ci
npx playwright install chromium
cp .env.example .env      # fill in the test accounts from Betsson (never commit .env)

npm run calibrate         # NO spin: logs in, opens the game, dumps what the checker sees
npm test                  # both scenarios on betsson.es  (⚠ Real Play spin)
npm run report            # open the Playwright report
npm run unit              # offline tests of the pure parsing / vision helpers
```

Reports: `reports/index.html` (pass/fail per check and scenario) and `reports/playwright/` (screenshots with OCR regions
drawn, trace and video per test).

## Player mode (recommended): run inside a browser you opened

Betsson's fraud detection rejects logins from Playwright-launched browsers ("Actualiza la página y vuelve a intentarlo
en breve"). The checker therefore attaches to a normal browser the player opened, over CDP:

```bash
npm run browser   # opens Brave (or Chrome) with its own profile in .cache/ and DevTools on 127.0.0.1:9222
                  # set CDP_URL=http://127.0.0.1:9222 in .env
# in that window, BY HAND: log in, open a Pragmatic Play game, accept the game-session dialogs and enter Real Play
npm run calibrate # NO spin: attaches to the open game tab and dumps what the checker sees
npm test          # scenarios run on the open game tab
```

- The login and the Spanish **game-session / responsible-gambling dialogs are always done by the player**, never automated.
- If no game tab is open, the checker stops and asks for it instead of navigating.
- `npm run login` saves the session of that browser to `.auth/` (gitignored) for runs without CDP.
- Optional `EXTRA_HTTP_HEADERS` (JSON, from the mentors) is added only to requests to the Betsson domain.

## Calibration (first thing once you have the accounts)

`npm run calibrate` writes to `calibration/es/` (gitignored):

- `betsson-balance-candidates.json` → elements (through Shadow DOM) showing an amount in €: set `selectors.headerBalance`
  in `src/config/markets.ts`
- `provider.json`, `frames.json` → provider evidence and the game iframe URL (`frameUrl` in `src/config/game-layout.ts`)
- `canvas-N-annotated.png` + `canvas-N-ocr.json` → every text the OCR reads and where; check **HUD region**, **reels
  region** and **spin fallback**, tune `hud`, `reels`, `spinButton` in `game-layout.ts`
- `spin-candidate-N.png` → if it shows the spin button, copy it to `assets/templates/<GAME_SLUG>/spin.png`
  so the button is **found visually**

Things that can only be confirmed logged in (marked `CALIBRATE`): header balance selector, the Spanish **session-limits**
dialog shown before playing slots (`handleSessionLimits` in `src/pages/betsson-site.ts`), HUD and message texts.

## Architecture

```
src/config/      markets.ts (betsson.es URLs, test ids, texts) · game-text.ts (HUD/message texts per language)
                 game-layout.ts (regions inside the canvas) · env.ts (secrets from env only)
src/auth/        login in a throw-away, untraced context → tests start authenticated (passwords never in traces/videos)
src/pages/       BetssonSite (provider page, game page, Real Play, session limits) · BetssonWallet (header balance, side tab)
src/vision/      GameScreen (canvas, clicks/keys) · ocr.ts (tesseract.js + preprocessing) · hud.ts (label → value)
                 motion.ts (frame diff, idle noise, settle) · template.ts (spin button matching) · spin.ts · annotate.ts
src/utils/       money.ts (es-ES / en amounts, 1-cent tolerance) · checks.ts (report rows) · provider-tap.ts (bonus)
src/reporter/    checks-reporter.ts → checks.json + index.html
tests/scenarios/ scenario1-real-play-spin.spec.ts · scenario2-insufficient-balance.spec.ts
tests/           fixtures.ts · calibrate.spec.ts · unit/
```

Design choices:

- betsson.es is built with web components (Shadow DOM) tagged with `data-test-id`; Playwright's `getByTestId`
  (configured to `data-test-id`) pierces shadow roots, so Betsson's UI is driven by stable test ids.
- **Spin trigger** strategies in order: visual template → `SPACE` key → calibrated position. After each attempt the screen
  decides (motion, or credit changed) and we stop — a spin is never triggered twice.
- **Idle noise** is measured before spinning, so idle animations are not mistaken for a spin.
- **No retries** (`retries: 0`): a retry is another real-money spin.
- Every check is a soft assertion → the report shows all checks; the test still fails if any check fails.
- Headed Chromium, fixed viewport 1600×900, scale 1 for stable OCR. Cookies: "reject all" (OneTrust).
- Spanish OCR data ships as an npm package (`@tesseract.js-data/spa`) → no CDN download at runtime.

## GitHub Actions

`.github/workflows/game-validation.yml` runs both scenarios, builds the report and publishes it to **GitHub Pages**
(also as an artifact) with a summary table in the job page.

1. Settings → Environments → `betsson-es` with secrets `FUNDED_USER`, `FUNDED_PASS`, `EMPTY_USER`, `EMPTY_PASS`.
2. Settings → Pages → Source: **GitHub Actions**.
3. **betsson.es only serves Spain**: GitHub-hosted runners exit from US IPs. Register a **self-hosted runner** on a
   machine in Spain (Settings → Actions → Runners) and set repository variable `RUNNER_LABEL=self-hosted`.
4. Optional variable `GAME_SLUG`.

## Safeguards

- No credentials in the repo, report, screenshots or videos.
- Do not bypass CAPTCHAs / anti-bot (the site loads a Group-IB fraud-detection frame): if the automation is challenged,
  ask the mentors to allow-list the test accounts or IP.
