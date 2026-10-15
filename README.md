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

## Run in Brave (recommended)

Betsson's fraud detection rejects logins from Playwright-launched browsers ("Actualiza la página y vuelve a intentarlo
en breve"). The checker therefore drives a normal **Brave** (or Chrome) window over CDP.

Setup once: `npm ci`, `cp .env.example .env`, fill in `FUNDED_USER` / `FUNDED_PASS` and set
`CDP_URL=http://127.0.0.1:9222` in `.env`.

**From scratch** (the checker does the whole journey: cookies, login, provider page, game):

```bash
npm run browser:fresh  # opens Brave with an EMPTY profile (.cache/browser-profile) and DevTools on 127.0.0.1:9222
npm run calibrate      # NO spin: logs in, opens the game, dumps what the checker sees
npm test               # both scenarios (⚠ Real Play spin)
```

Keep the Brave window open while the tests run. Brave is found automatically on Windows / macOS / Linux; set
`BROWSER_PATH` to use another Chromium-based browser (e.g. Chrome).

**Reusing a game you opened by hand:** `npm run browser` (keeps the profile), open a Pragmatic Play game in Real Play
in that window, then run the tests: the checker attaches to that tab instead of navigating.

- `npm run login` saves the browser's session to `.auth/` (gitignored) for runs without CDP.
- Optional `EXTRA_HTTP_HEADERS` (JSON, from the mentors) is added only to requests to the Betsson domain.

## Run everything in one go: `npm run all`

Each part runs in its **own fresh Brave** (empty profile), so no account reuses another one's session. At the end,
one merged report: **`site/index.html`** (pass/fail per check) + `site/playwright/index.html` (traces, screenshots).

| # | Part | Account | Real money | Expected result |
|---|---|---|---|---|
| 1 | **Scenario 1** — completed Real Play spin | `FUNDED_USER` | 1 spin, minimum wager | ✓ pass |
| 2 | **Scenario 2** — insufficient balance | `EMPTY_USER` | none (0 €) | ✓ pass (skipped without `EMPTY_USER/PASS`) |
| 3 | **Spin series** — `SPINS` spins (default 5), never above `MAX_BET` (default 0.10) | `FUNDED_USER` | 5 spins | ✓ pass |
| 4 | **Report demo** — a test that **fails on purpose** | `FUNDED_USER` | 1 spin | ✗ **fails by design** |

**The report demo (4) fails on purpose** to show what a failure looks like in the report. The journey is real (login,
game, one spin), then the CREDIT read after the spin is **altered by −1 €**. A row **"FALLO PROVOCADO A PROPÓSITO"**
declares it in the report. With that "misread", two checks fail as they would with a real OCR error:

- `money.game`: in-game balance rule `after = before − wager + payout` (expected 105.72 €, "read" 104.72 €)
- `site.exitBalance`: in-game CREDIT vs **Betsson's balance on the page (DOM)** (104.72 € vs 105.72 €)

Each failure card shows expected vs observed, the step's log lines and the real screenshot (where the true CREDIT is
visible). In the `npm run all` summary it appears as **"fallo provocado, ESPERADO"** and it does **not** count in the
exit code: `npm run all` is green when 1–3 pass and the demo fails as designed.

```bash
npm run all                          # 1 + 2 + 3 + 4 (≈ 7 spins at the minimum wager)
npm run all -- --no-report-demo      # only the real journeys (1–3)
npm run all -- --no-spins            # without the spin series
npm run report:demo                  # only the report demo (needs a Brave open: npm run browser:fresh)
```

## Atomic steps (how the team works on it)

Every journey is a **plain sequence of atomic steps** (`src/steps/`). A step **detects** where it is, **acts** like a
player, **validates on screen** that it worked, and **logs** what it read. Input and output are explicit, so each
person can own, test and optimise one step (template matching, Hough, YOLO, a vision-language model, …) without
touching the others — as long as the step keeps its input/output contract.

```ts
// tests/scenarios/scenario1-real-play-spin.spec.ts (abridged)
await steps.must(checkLoggedIn);
await steps.must(goToGame);
await steps.must(startGameSession);
const { game } = (await steps.must(attachGame)).data;
await steps.must(enterGame, { game });
const betsson = (await steps.must(readBetssonBalance)).data.balance;
const before = (await steps.must(readGameHud, { game })).data;
await steps.must(preflight, { credit: before.credit, bet: before.bet, betsson });
await steps.must(spin, { game, credit: before.credit, noise });
const after = (await steps.must(waitSpinEnd, { game, noise })).data;
await steps.run(reconcileGame, { before: before.credit, bet: before.bet, after: after.credit, win: after.win });
```

`steps.must` = the journey cannot continue without it · `steps.run` = recorded, the journey goes on.
The runner (`src/steps/runner.ts`) gives every step the same treatment: a Playwright step, console log lines
(`▶ start · log ✓ pass ✗ fail ! error ↻ retry`, with what was read on screen), a PASS/FAIL row with evidence in
the report, `steps.jsonl` attached to the test, controlled retries **only for read/navigation steps** (never for
anything that can spend money) and fault isolation (an exception becomes a FAIL, not a crash).

| Step | File | Validates (on screen) | Current technique |
|---|---|---|---|
| `site.loggedIn` | site.steps.ts | balance visible in Betsson's header | Betsson DOM (test ids) |
| `site.goToGame` | site.steps.ts | game page is Pragmatic Play (`game-detail-pragmaticPlay…`) | GAME_SLUG or first slot of the provider page |
| `site.gameSession` | site.steps.ts | regulated dialogs gone (shortest time, lowest loss limit) | Betsson DOM, intent regexes per market |
| `game.attach` | site.steps.ts | canvas present and not blank | frame scan + pixel stdev |
| `game.enter` | game.steps.ts | intro passed → CREDIT and BET readable | continue icon (ZNCC) / text (OCR), pressed once |
| `game.readHud` | game.steps.ts | CREDIT/BET stable, market currency and language | OCR (bright-text binarisation) |
| `game.minBet` | game.steps.ts | BET not higher than before | "−" icon (ZNCC), burst |
| `betsson.readBalance` | site.steps.ts | balance in the market currency | Betsson header, second tab |
| `money.preflight` | money.steps.ts | safe to spend one spin | pure rule |
| `game.idleNoise` | game.steps.ts | idle animation level | frame diff |
| `game.spin` | game.steps.ts | reels moved / CREDIT changed (never retried) | cascade: icon → SPACE → calibrated point |
| `game.spinEnd` | game.steps.ts | button back + reels calm + CREDIT stable | ZNCC re-check + frame diff + OCR |
| `money.wagerUsed` | money.steps.ts | BET unchanged and debit = BET | pure rule |
| `money.game` | money.steps.ts | after = before − wager + payout | pure rule |
| `money.betsson` | money.steps.ts | Betsson end = start − Σwagers + Σpayouts | Betsson header, polled |
| `game.spinRejected` | game.steps.ts | reels did NOT move (scenario 2) | frame diff |
| `game.message` | game.steps.ts | message visible in the market language | OCR + intent regexes |
| `money.unchanged` | money.steps.ts | a balance did not move | pure rule |

Journeys built from them: `npm test` (scenarios 1 and 2), `npm run spins` (series with a balance chart),
`npm run demo` (fast continuous spins, no report). Set `STEP_LOGS=0` to silence step logs.

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
                 motion.ts (frame diff, idle noise, settle) · template.ts (ZNCC matching) · spin.ts · annotate.ts
src/vision/controls/
                 screen-target.ts  ScreenTarget: TemplateTarget (icon by image) · OcrTextTarget · FixedPointTarget · FirstVisibleTarget
                 player-action.ts  PlayerAction: ClickOn(target) · PressKey(key)
                 game-controls.ts  GameControls per provider: pragmaticControls() (round arrows icon = spin / continue)
assets/templates/pragmatic/spin.png   the round arrows icon the checker looks for
src/utils/       money.ts (es-ES / en amounts, 1-cent tolerance) · checks.ts (report rows) · provider-tap.ts (bonus)
src/reporter/    checks-reporter.ts → checks.json + index.html
tests/scenarios/ scenario1-real-play-spin.spec.ts · scenario2-insufficient-balance.spec.ts
tests/           fixtures.ts · calibrate.spec.ts · unit/
```

Design choices:

- betsson.es is built with web components (Shadow DOM) tagged with `data-test-id`; Playwright's `getByTestId`
  (configured to `data-test-id`) pierces shadow roots, so Betsson's UI is driven by stable test ids.
- **Controls are found like a player finds them (SOLID):** scenarios depend on the `GameControls` abstraction, not on
  coordinates. Pragmatic's spin button is located **by image** (multi-scale ZNCC template matching with a circular mask,
  so it works at any window size and on any background); then `SPACE`; a calibrated position only as last resort.
  After each action the **screen** decides (reels move, or credit changed) and we stop — a spin is never triggered twice.
  A new provider = a new controls factory; nothing else changes.
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
