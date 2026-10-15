# Reparto del trabajo — 4 personas, 0 conflictos al mergear

**Para cada IA:** pásale `docs/ai-briefs/_COMMON.md` y **su** brief. Los briefs son la referencia detallada: qué tocar, qué no, entregables y cuándo está terminado.

| Persona | Brief | Bloque | Tareas | Rama |
|---|---|---|---|---|
| **A** | `docs/ai-briefs/A-narrativa.md` | Narrativa + **validación de saldos sin gastar dinero** | 1) Por qué TypeScript · 2) SOLID · 6) Enfoque de QA · **cuenta sin saldo bloqueada (escenario 2)** · **saldo del juego = saldo de la cabecera de Betsson** | `feat/narrative-balance` |
| **B** | `docs/ai-briefs/B-vision.md` | Visión: enfoques y alternativas | 3) OCR, template matching, segmentación, Hough, YOLO, VLM… con mediciones + una alternativa implementada | `feat/vision-approaches` |
| **C** | `docs/ai-briefs/C-reports.md` | Logs, informes y aislamiento | (Jorge) logs, registros y tests detallados · 4) *Testing isolation* · 5) Informe con solo los fallos, su captura y el porqué | `feat/reports-isolation` |
| **D** | `docs/ai-briefs/D-demo.md` | Demo rápida + dueño del dinero real | 7) Demo en vivo < 4 min · `npm run all` · dependencias del equipo | `feat/fast-demo` |

> La tarea 4 venía escrita como «traimiing isolation». La interpretamos como **testing isolation**. Si era otra cosa, avisad a C.

## Quién valida qué saldo

| Validación | Dueño | Gasta dinero | Cómo |
|---|---|---|---|
| Escenario 1: `después = antes − apuesta + premio` (juego y Betsson) | D (lo ejecuta) | sí, una tirada a la apuesta mínima | `npm test` / `npm run all` |
| **Cuenta sin saldo → el checker no tira** | **A** | no | `npm run balance` (`tests/balance/zero-balance.spec.ts`) |
| **Escenario 2: intento rechazado, mensaje en español, saldos sin cambiar** | **A** (lo ejecuta en vivo) | no (0 €) | escenario 2 oficial con la cuenta sin saldo |
| **CRÉDITO del juego = saldo de la cabecera de Betsson** | **A** | no | `npm run balance` (`tests/balance/game-vs-header.spec.ts`) |
| Comprobación previa a cualquier tirada (`money.preflight`) | congelado (todos la usan) | — | está en todos los recorridos que tiran |

**Nunca dos personas en vivo a la vez con la misma cuenta**: si D tira mientras A compara saldos, las comparaciones fallan. Avisaos por el chat.

## Reglas clave (detalle en `_COMMON.md`)

1. Solo editas tus archivos. **`node scripts/check-ownership.cjs <A|B|C|D>` debe decir OK** antes del PR, y falla si tocas algo ajeno.
2. Contratos congelados: los pasos existentes (`src/steps/**`), `tests/scenarios/**`, `src/config/**`, `src/auth/**`, `tsconfig.json`. Lo nuevo va en archivos nuevos.
3. **Dependencias nuevas: solo D** (`package.json` y `package-lock.json`), en un PR pequeño que se mergea antes. Así el lockfile no entra en conflicto.
4. Sin secretos en el código, los docs, las capturas ni los commits.
5. Dinero real: solo D tira. A ejecuta en vivo solo pruebas de saldo que nunca tiran.
6. `npx tsc --noEmit` y `npm run unit` en verde antes de cada PR.

**Orden de merge:** dependencias de D (si las hay) → **C → B → A → D**.
- C toca la base (runner e informe).
- B añade técnicas.
- A añade sus pasos de saldo y luego los docs.
- D cierra con la demo sobre todo lo anterior.

Antes de abrir el PR, cada uno hace `git rebase origin/main`.

## Mapa de propiedad de archivos

Fuente de verdad: `scripts/check-ownership.cjs`. Ningún archivo tiene dos dueños.

| Rutas | Dueño |
|---|---|
| `README.md`, `docs/{why-typescript,code-philosophy,qa-approach,presentation-outline,balance-validation}.md`, `docs/presentation/**`, `docs/WORK-SPLIT.md`, `docs/ai-briefs/**`, **`src/steps/balance.steps.ts`, `src/pages/header-balance.ts`, `tests/balance/**`, `tests/unit/balance.spec.ts`, `tests/unit/fixtures/balance/**`** | A |
| `docs/vision-approaches.md`, `src/vision/controls/**`, `src/vision/template.ts`, `assets/templates/**`, `scripts/bench-vision*`, `tests/unit/vision-approaches.spec.ts`, `tests/unit/fixtures/vision/**` | B |
| `src/steps/runner.ts`, `src/utils/checks.ts`, `src/reporter/**`, `merge.config.ts`, `playwright.config.ts`, `tests/fixtures.ts`, `tests/unit/{steps,reporter,isolation}.spec.ts`, `docs/{reports-and-logs,test-isolation}.md`, `.gitignore`, `ci/**`, `.github/**` | C |
| `tests/demo/**`, `scripts/{open-browser,demo*,run-all}*`, `package.json`, `package-lock.json`, `src/vision/{settle,motion,bet,hud,ocr,game-screen}.ts`, `src/pages/betsson-site.ts`, `src/pages/betsson-wallet.ts`, `.env.example`, `docs/demo-runbook.md`, `tests/unit/fixtures/demo/**` | D |
| Todo lo demás: `src/steps/{step,index,*.steps}.ts` existentes, `tests/scenarios/**`, `tests/series/**`, `tests/calibrate.spec.ts`, `src/config/**`, `src/auth/**`, `src/utils/{money,text,preflight}.ts`, `src/vision/{annotate,spin}.ts`, `tsconfig.json`, `scripts/check-ownership.cjs` | **Congelado**: solo con un PR pequeño acordado por el equipo |

Ya creados en `main` para que nadie dependa de otro: el proyecto `balance-betsson.es` y el script `npm run balance` (para A), `npm run all` (de D) y el proyecto `series-betsson.es`.
