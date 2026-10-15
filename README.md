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

## Requirements

- **Node.js 22+**
- **Brave** ([brave.com](https://brave.com)). **This project runs only on Brave**: Betsson's fraud detection rejects
  browsers launched by automation, so the checker attaches to a normal Brave window over CDP and verifies it is Brave
  (`navigator.brave`). There is no Chrome/Chromium fallback. Brave is found automatically in its standard folder on
  Windows, macOS and Linux; otherwise set `BRAVE_PATH` to the Brave executable.
- The two test accounts (see "Configuration: `.env`").

## Quick start

```bash
npm ci
cp .env.example .env      # then add the two passwords (see "Configuration: .env"); never commit .env

```

Reports: `reports/index.html` (pass/fail per check and scenario) and `reports/playwright/` (screenshots with OCR regions
drawn, trace and video per test).

## Run in Brave

Betsson's fraud detection rejects logins from Playwright-launched browsers ("Actualiza la página y vuelve a intentarlo
en breve"). The checker therefore drives a normal **Brave** window over CDP.

Setup once: `npm ci` and the `.env` file below.

## Configuration: `.env`

`.env.example` already has everything filled in **except the passwords**:

```bash
cp .env.example .env
# then write the two passwords in .env (FUNDED_PASS, EMPTY_PASS): the team shares them privately
```

| Variable | Value in `.env.example` | What it is |
|---|---|---|
| `FUNDED_USER` / `FUNDED_PASS` | test account with balance / **empty: fill in** | Scenario 1, spin series, report demo |
| `EMPTY_USER` / `EMPTY_PASS` | test account without balance / **empty: fill in** | Scenario 2 (the spin must be blocked). Without it, scenario 2 is skipped |
| `CDP_URL` | `http://127.0.0.1:9222` | Brave driven over CDP (`npm run browser:fresh` opens it on this port) |
| `GAME_SLUG` | `triple-hop-pots` | Pragmatic Play game to test (empty = first slot of the Pragmatic Play page) |
| `EXTRA_HTTP_HEADERS` | Betsson `x-obg-*` headers (JSON) | Mark the traffic as test traffic; sent only to the Betsson domain |
| `BRAVE_PATH`, `PROXY_*` | commented out | Optional: Brave installed in a non-standard folder, a proxy |

## Run everything in one go: `npm run all`

Each part runs in its **own fresh Brave** (empty profile), so no account reuses another one's session. At the end,
one merged report: **`site/index.html`** (pass/fail per check) + `site/playwright/index.html` (traces, screenshots).

| # | Part | Account | Real money | Expected result |
|---|---|---|---|---|
| 1 | **Scenario 1** — completed Real Play spin | `FUNDED_USER` | 1 spin, minimum wager | ✓ pass |
| 2 | **Scenario 2** — insufficient balance | `EMPTY_USER` | none (0 €) | ✓ pass (skipped without `EMPTY_USER/PASS`) |
| 3 | **Spin series** — **5 spins** in `npm run all` (`SPINS`, default 5 here; 10 when run alone with `npm run spins`), never above `MAX_BET` (0.10 €) | `FUNDED_USER` | 5 spins | ✓ pass |
| 4 | **Raise the wager with "+"** — from the minimum, "+" once (`BET_STEPS`, default 1, cap `BET_MAX` 0.50 €), one spin at the raised wager | `FUNDED_USER` | 1 spin (≈ 0.20 €) | ✓ pass |
| 5 | **Report demo** — a test that **fails on purpose** | `FUNDED_USER` | 1 spin | ✗ **fails by design** |

**Raise the wager (4)** — `tests/bet/raise-bet.spec.ts`, also alone with `npm run bet:raise`. It proves the player can
change the wager and that the checker still validates everything from the screen:

1. lowers the wager to the minimum (`game.minBet`) and reads it (e.g. 0,10 €);
2. presses **"+"** — found **by image next to the spin button** — **one step at a time**, reading BET after each press
   (`game.raiseBet`): it must go up (0,10 → 0,20 €) and **never above the cap**; a press over the cap is undone with "−";
3. CREDIT must not change while the wager changes (a press on the wrong control could start a spin);
4. spins **once** at the raised wager and checks that **the raised wager is the one charged** (`money.wagerUsed`) and that
   the in-game and Betsson balances reconcile (`money.game`, `money.betsson`): e.g. 104,60 − 0,20 = 104,40 €;
5. puts the wager back to the minimum for the next run.

**The report demo (5) fails on purpose** to show what a failure looks like in the report. The journey is real (login,
game, one spin), then the CREDIT read after the spin is **altered by −1 €**. A row **"FALLO PROVOCADO A PROPÓSITO"**
declares it in the report. With that "misread", two checks fail as they would with a real OCR error:

- `money.game`: in-game balance rule `after = before − wager + payout` (expected 105.72 €, "read" 104.72 €)
- `site.exitBalance`: in-game CREDIT vs **Betsson's balance on the page (DOM)** (104.72 € vs 105.72 €)

Each failure card shows expected vs observed, the step's log lines and the real screenshot (where the true CREDIT is
visible). In the `npm run all` summary it appears as **"fallo provocado, ESPERADO"** and it does **not** count in the
exit code: `npm run all` is green when 1–4 pass and the demo fails as designed.

```bash
npm run all                          # 1 + 2 + 3 + 4 + 5 (8 real spins: 7 at the minimum wager, 1 at the raised one)
npm run all -- --no-report-demo      # only the real journeys (1–4)
npm run all -- --no-spins            # without the spin series
npm run all -- --no-bet-raise        # without the "+" test
npm run bet:raise                    # only the "+" test (needs a Brave open: npm run browser:fresh)
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
- Brave window, fixed size 1600×1000, scale 1 for stable OCR. Cookies: "reject all" (OneTrust).
- Spanish OCR data ships as an npm package (`@tesseract.js-data/spa`) → no CDN download at runtime.

## GitHub Actions — everything, proven in CI

Workflow: **`.github/workflows/validation.yml`** (Actions tab → "Intelligent Game Validation").

| Job | Runs on | When | What it proves |
|---|---|---|---|
| **offline** | GitHub-hosted (Ubuntu) | every push and pull request | Typecheck · all unit tests on **real game frames** (money parsing, HUD OCR, spin/bet buttons, pre-spin guard, atomic-step runner, failures-only report) · **vision benchmark** (template ZNCC vs Hough vs segmentation, HUD OCR preprocessing, motion) with its charts |
| **live** | self-hosted runner in Spain with **Brave** (label `brave-es`) | **by hand**: Actions → *Run workflow* → tick **live** | `npm run all` on betsson.es: scenario 1 (real spin, minimum wager, balances reconciled), scenario 2 (account without balance: spin rejected, message in Spanish, balances unchanged), spin series, and the report demo that **fails on purpose**. ⚠ real money at the minimum wager |
| **pages** | GitHub-hosted | after them, on `main` | Publishes **one site with all of it** to GitHub Pages: live report (or the last one committed in `site/`), unit-test report, vision charts |

Every run also writes a **summary on the run page**: unit tests per file, the spin-button benchmark table (hits, false
positives, error, speed), HUD OCR results, motion levels and, when the live job ran, the checks per journey.

**Why live runs on a self-hosted runner:** betsson.es only serves Spain (GitHub's runners are in the US), Betsson's
fraud detection rejects automated browsers (so the checker drives a real **Brave** window, which needs a desktop
session), and it needs the test accounts.

One-time setup (repository Settings):

1. **Pages** → Source: **GitHub Actions**.
2. **Environments** → `betsson-es` → secrets `FUNDED_USER`, `FUNDED_PASS`, `EMPTY_USER`, `EMPTY_PASS`,
   `EXTRA_HTTP_HEADERS` (optional variable `GAME_SLUG`). They are written to a temporary `.env` during the live job
   (never printed) and deleted at the end.
3. **Actions → Runners** → *New self-hosted runner* on a PC in Spain with **Brave** installed, label **`brave-es`**.
   Start it as the logged-in user (`./run.cmd`), not as a Windows service: Brave needs a desktop to render the game.

Artifacts never include Playwright traces (`*.zip`): they record network requests, session cookies included.

## Safeguards

- No credentials in the repo, report, screenshots or videos.
- Do not bypass CAPTCHAs / anti-bot (the site loads a Group-IB fraud-detection frame): if the automation is challenged,
  ask the mentors to allow-list the test accounts or IP.
