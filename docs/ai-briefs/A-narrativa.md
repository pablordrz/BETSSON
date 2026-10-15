# Brief para la IA de la persona A — Narrativa + validación de saldos (sin gastar dinero)

> Lee primero `docs/ai-briefs/_COMMON.md` (contexto, reglas y flujo de git). Este archivo **amplía** ese contexto y no lo sustituye.

**Rama:** `feat/narrative-balance` · **Letra para el check:** `A`

## Tu misión (dos partes)

**Parte 1 — Narrativa.** Los textos de la presentación (7 minutos) y del informe:
1. **Por qué TypeScript.**
2. **Filosofía del código: SOLID.**
3. **Nuestro enfoque de QA.**
4. El **guion de la presentación** con minutaje.

**Parte 2 — Validación de saldos que NO gastan dinero:**
- la **cuenta sin saldo** queda bloqueada (escenario 2);
- el **saldo del juego es igual al saldo de la cabecera de Betsson** («el de arriba del menú»).

Cada afirmación técnica debe apoyarse en **código real del repo** (ruta + fragmento corto). Nada que el código no haga.

## PUEDES TOCAR (solo esto)

```
# Parte 1 — narrativa
README.md                       (solo para enlazar los docs de todos; lo cierras al final)
docs/why-typescript.md          (nuevo)
docs/code-philosophy.md         (nuevo)
docs/qa-approach.md             (nuevo)
docs/presentation-outline.md    (nuevo)
docs/presentation/**            (nuevo: imágenes o diagramas)
docs/WORK-SPLIT.md, docs/ai-briefs/**   (si hay que corregir el reparto)

# Parte 2 — saldos (todo NUEVO)
src/steps/balance.steps.ts      (pasos de saldo)
src/pages/header-balance.ts     (lee el saldo de la cabecera de Betsson EN LA MISMA página del juego)
tests/balance/**                (pruebas en vivo SIN tiradas → npm run balance; el proyecto ya existe)
tests/unit/balance.spec.ts      (tests offline de tus pasos)
tests/unit/fixtures/balance/**  (capturas SIN datos personales)
docs/balance-validation.md
```

## NO TOQUES (solo lectura)

- Todo `src/**` y `tests/**` que no esté en tu lista. En particular:
  - `src/steps/{step,runner,index}.ts` y los `*.steps.ts` existentes (congelados o de C);
  - `src/pages/betsson-site.ts` y `src/pages/betsson-wallet.ts` (de D);
  - `tests/scenarios/**` (congelado: solo lo **ejecutas**) y `src/config/**` (congelado).
- `package.json`, `playwright.config.ts`, `scripts/**`. Ya tienes `npm run balance` y el proyecto `balance-betsson.es`.
- Los docs de los demás: `docs/vision-approaches.md` (B), `docs/reports-and-logs.md` y `docs/test-isolation.md` (C), `docs/demo-runbook.md` (D).

---

## Parte 1 — Narrativa

1. **`docs/why-typescript.md`**:
   - tipos en los contratos (`Step<I, O>` en `src/steps/step.ts`), con errores detectados antes de ejecutar con dinero real (`npx tsc --noEmit`);
   - Playwright nativo en TS, un solo lenguaje para la web y los tests;
   - `sharp` y `tesseract.js` sin Python;
   - qué perderíamos con Python o Java.
2. **`docs/code-philosophy.md`**: SOLID con **un ejemplo real por principio**:
   - S: cada paso de `src/steps/*.steps.ts` hace una sola cosa;
   - O: `src/vision/controls/game-controls.ts`, donde un proveedor nuevo es una fábrica nueva;
   - L: cualquier `ScreenTarget` es intercambiable en la cascada;
   - I: `StepContext` mínimo;
   - D: los escenarios dependen de abstracciones.

   Explica también los pasos atómicos, las cascadas, los reintentos solo en lecturas (nunca en tiradas) y el aislamiento de errores (`src/steps/runner.ts`).
3. **`docs/qa-approach.md`**:
   - «ver como un jugador»: el clic no es prueba, la pantalla sí;
   - comprobación previa antes de gastar dinero (`src/utils/preflight.ts`);
   - cuadre del saldo en el juego y en Betsson;
   - pirámide de tests: unit offline con fotogramas reales → calibración sin dinero → escenarios reales;
   - riesgos cubiertos y no cubiertos.

   Usa como ejemplos reales tus pruebas de la Parte 2.
4. **`docs/presentation-outline.md`**: minutaje, **total ≤ 7 min**, con **≤ 4 min para la demo de D**.
5. Al final, en `README.md`: una sección «Documentación» con enlaces a los docs de todos.

---

## Parte 2 — Validación de saldos sin gastar dinero

Son pruebas en vivo que **nunca tiran**, así que las ejecutas tú. **No las lances a la vez que D con la misma cuenta**: si D está tirando, los saldos se mueven y tus comparaciones fallan. Avisaos por el chat.

Cuentas en `.env` (las credenciales se pasan por privado; nunca en el repo):
- `FUNDED_USER/PASS`: con saldo;
- `EMPTY_USER/PASS`: **sin saldo**.

### 2.1 Cuenta SIN saldo → el checker la bloquea

1. **`tests/balance/zero-balance.spec.ts`** (nuevo), con `test.use({ account: 'empty' })`:
   - Brave limpio (`npm run browser:fresh`) → login con la cuenta sin saldo → `site.goToGame` → `site.gameSession` → `game.attach` → `game.enter` → `game.readHud` (CRÉDITO ≈ 0,00 €) → `betsson.readBalance` → `money.preflight`, que **debe devolver NO seguro**.
   - El test pasa si el checker **se niega a tirar**, con el motivo en el informe (p. ej. «CREDIT 0.00 < BET 0.10»).
   - **Nunca llames a `spin`** en este test.
   - Usa los pasos existentes desde `src/steps` (no se modifican). Lo tuyo es la secuencia y, si hace falta, pasos nuevos en `balance.steps.ts`.
2. **Ejecuta en vivo el escenario 2 oficial** (congelado, solo lo ejecutas): `npm run browser:fresh` y después `npx playwright test --project=betsson.es tests/scenarios/scenario2-insufficient-balance.spec.ts`. Comprueba que se intenta tirar y se rechaza, que sale el mensaje de saldo insuficiente en español y que ni el saldo del juego ni el de Betsson cambian. Con 0 € no se gasta nada.
3. **Confirma en vivo** lo que todavía no se ha visto con una cuenta a 0 €:
   - si Betsson deja abrir Real Play y la sesión de juego (el límite de pérdidas es un % del saldo);
   - qué texto exacto sale y dónde (en el canvas o en la web).

   Si el escenario 2 o `src/config/game-text.ts` (`insufficientBalance`) necesitan cambios, están **congelados**: pásale al equipo la captura y el texto exacto, y se cambian en un PR pequeño acordado.

### 2.2 Saldo del juego = saldo de la cabecera de Betsson («arriba del menú»)

Hoy **nadie lo comprueba**: es tu tarea.
1. **`src/pages/header-balance.ts`** (nuevo): lee el saldo que muestra **la cabecera de Betsson en la misma página del juego**. Si está plegado tras el botón «Saldo», ábrelo como lo haría un jugador y vuelve a dejarlo como estaba.
   - Selector de referencia: `[data-test-id="balance-button"]` (`src/config/markets.ts`).
   - No reutilices ni cambies `src/pages/betsson-wallet.ts` (de D): ese lee en **otra** pestaña.
2. **`src/steps/balance.steps.ts`** (nuevo), con el mismo contrato que los demás pasos (`defineStep`, ver `src/steps/step.ts` y ejemplos en `src/steps/money.steps.ts`):
   - `header.readBalance`: el saldo de la cabecera en la página del juego, en EUR, con captura de la cabecera como evidencia;
   - `money.gameMatchesHeader`: `CRÉDITO del juego == saldo de la cabecera` (tolerancia 1 céntimo). Si no cuadra, el `detail` dice la diferencia y posibles causas (dinero de bono o saldo retenido).
3. **`tests/balance/game-vs-header.spec.ts`** (nuevo): login → juego → `game.readHud` → `header.readBalance` → `money.gameMatchesHeader`. **Sin tiradas.** Ejecútalo con la cuenta con saldo (**cuando D no esté tirando**) y con la cuenta sin saldo.
4. **`tests/unit/balance.spec.ts`**: las reglas de comparación con valores fijos (iguales, diferencia de 1 céntimo, diferencia real, moneda distinta).
5. **`docs/balance-validation.md`**: qué se compara, por qué, cómo se ejecuta y qué significa si no cuadra. Incluye el resultado real del escenario 2.

> Integrar `money.gameMatchesHeader` **después de la tirada** en el escenario 1 (archivo congelado) se propone en un PR pequeño acordado, cuando tus pasos ya estén en `main`.

---

## Peticiones típicas a otros

- A **B**, C y D: un párrafo-resumen de su parte para la presentación.
- A **D**: la duración real de la demo, y avisarse para no ejecutar en vivo a la vez con la misma cuenta.
- A **C**: si quieres que tus pruebas salgan en el informe unido de `npm run all`, que te avise de cómo engancharlas (el runner es suyo).

## Terminado cuando

- Los 4 docs de la Parte 1 existen, con rutas y fragmentos reales.
- `npm run balance` en vivo:
  - **la cuenta sin saldo queda bloqueada** (no tira, con el motivo en el informe);
  - **el saldo del juego coincide con el de la cabecera**, con ambas cuentas.
- El escenario 2 oficial se ha ejecutado en vivo y su resultado está documentado en `docs/balance-validation.md`.
- `node scripts/check-ownership.cjs A` → OK, `npx tsc --noEmit` y `npm run unit` en verde.
