# Brief para la IA de la persona D — Demo rápida (< 7 min de presentación)

> Lee primero `docs/ai-briefs/_COMMON.md` (contexto, reglas y flujo de git). Este archivo **amplía** ese contexto y no lo sustituye.

**Rama:** `feat/fast-demo` · **Letra para el check:** `D`

## Tu misión

Que la demo en vivo sea **fiable y rápida**: de Brave limpio a varias tiradas con el saldo cuadrado en **menos de 4 minutos**, para que quepa en los 7 de la presentación.

Eres **la única persona que ejecuta con dinero real**: `npm test`, `npm run spins` y `npm run demo`, siempre con **apuesta mínima**. También gestionas las **dependencias** de todo el equipo.

Situación de partida, medida en vivo: unos **86 s** hasta tener el juego listo y **14–30 s por tirada**. Objetivo: **< 40 s** y **< 8 s**.

## PUEDES TOCAR (solo esto)

```
tests/demo/**
scripts/open-browser.cjs, scripts/demo*, scripts/run-all.cjs   (npm run all)
package.json, package-lock.json        (scripts y dependencias para todo el equipo)
src/vision/settle.ts, motion.ts, bet.ts, hud.ts, ocr.ts, game-screen.ts
                                        (solo rendimiento interno; NO cambies las firmas exportadas)
src/pages/**                            (betsson-site.ts, betsson-wallet.ts: esperas y navegación; sin cambiar firmas)
.env.example
docs/demo-runbook.md                    (nuevo)
tests/unit/fixtures/demo/**             (fotogramas que te pidan B o C, SIN datos personales)
```

## NO TOQUES (solo lectura)

- `src/steps/**` (congelado), `tests/scenarios/**` (congelado);
- `src/vision/controls/**` y `src/vision/template.ts` (de B);
- `src/reporter/**`, `src/utils/checks.ts`, `tests/fixtures.ts`, `playwright.config.ts` (de C);
- `src/config/**`, `src/auth/**` (congelados).

## Entregables

1. **`npm run demo` en menos de 4 min con 5 tiradas**: login → juego → sesión regulada → apuesta mínima → tiradas → saldo de Betsson cuadrado al final.
   - Usa el **resumen de tiempos por paso** de C para saber dónde se va el tiempo.
   - Dónde está hoy:
     - `game.attach`: espera de iframes;
     - `game.enter`: OCR en bucle;
     - `game.spinEnd`: detección del final;
     - lectura del saldo de Betsson en otra pestaña.
2. **Consola para el público**: una línea por tirada (`saldo antes → después · apuesta · premio · tiempo`) y al final el cuadre.
3. **Plan B** por si falla en directo: grabación de una ejecución buena, capturas y `npm run calibrate` (sin tirada).
4. **`docs/demo-runbook.md`**:
   - preparación: Brave, `.env`, saldo de la cuenta, y la ventana de 60 min del aviso de juego responsable (si se jugó hace menos de una hora, aparece el aviso);
   - comandos exactos;
   - qué decir en cada momento;
   - qué hacer si falla.
5. **Dependencias**: si B o C piden un paquete, añádelo en un PR pequeño **que se mergea antes que los suyos**.
6. **Fotogramas** que pidan B o C (intro, rodillos girando, premio, saldo insuficiente), sin datos personales, en `tests/unit/fixtures/demo/`.

## Escenario 2 — usuario sin saldo (te toca a ti: eres quien ejecuta en vivo)

Con la cuenta **sin saldo** (`EMPTY_USER/PASS` en `.env`), el checker debe demostrar que **la tirada queda bloqueada**:
1. Inicia sesión con esa cuenta (Brave limpio: `npm run all` abre uno nuevo para cada escenario y así no hereda la sesión de la cuenta con saldo).
2. Entra en el juego y lee el saldo: CRÉDITO (≈ 0,00 €) y saldo de Betsson.
3. Intenta una tirada: `game.spinRejected` debe ver que **los rodillos no giran**.
4. `game.message`: mensaje de **saldo insuficiente en español**, en el juego o en la web de Betsson.
5. `money.unchanged`: **ni el saldo del juego ni el de Betsson cambian**.

**Qué tienes que hacer**
- Ejecutarlo en vivo (`npm run all`, o solo `npx playwright test --project=betsson.es tests/scenarios/scenario2-insufficient-balance.spec.ts` con un `npm run browser:fresh` antes) y revisar el informe.
- **Puntos que hay que confirmar en vivo**, porque aún no se han visto con una cuenta a 0 €:
  - si Betsson deja abrir Real Play o la sesión de juego sin saldo (el límite de pérdidas es un porcentaje del saldo);
  - qué texto exacto muestra el mensaje y dónde (en el canvas o en la web).
- Si el texto no lo reconoce la expresión de `src/config/game-text.ts` (`insufficientBalance`) o falta un paso, ese archivo está **congelado**: pásale al equipo la captura y el texto exacto, y se cambia en un PR pequeño acordado.
- Captura los fotogramas del mensaje (sin datos personales) en `tests/unit/fixtures/demo/` para B y C.

## Reglas especiales (dinero real)

- Siempre **apuesta mínima**. Nunca quites la comprobación previa (`money.preflight`) de los escenarios.
- Nunca reintentes automáticamente una tirada.
- No cambies cómo se tratan el aviso de juego responsable ni los límites: siempre los más protectores.

## Terminado cuando

- `npm run all` ejecuta todo seguido. El **escenario 2 bloquea la tirada** de la cuenta sin saldo, con el mensaje en español y los saldos sin cambiar.
- 3 ejecuciones seguidas de `npm run demo` sin intervención, todas en **menos de 4 min**.
- Los escenarios 1 y 2 siguen en verde con los mismos pasos, y `npm run unit` también.
- `node scripts/check-ownership.cjs D` → OK.
