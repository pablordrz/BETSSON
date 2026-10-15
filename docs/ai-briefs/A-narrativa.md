# Brief para la IA de la persona A — Narrativa y presentación

> Lee primero `docs/ai-briefs/_COMMON.md` (contexto, reglas y flujo de git). Este archivo **amplía** ese contexto y no lo sustituye.

**Rama:** `docs/narrative` · **Letra para el check:** `A`

## Tu misión

Escribir los textos de la presentación (7 minutos) y del informe:
1. **Por qué TypeScript.**
2. **Filosofía del código: SOLID.**
3. **Nuestro enfoque de QA.**
4. El **guion de la presentación** con minutaje.

Cada afirmación técnica debe apoyarse en **código real del repo** (ruta + fragmento corto). Nada que el código no haga.

## PUEDES TOCAR (solo esto)

```
README.md                       (solo para enlazar los docs de todos; lo cierras al final)
docs/why-typescript.md          (nuevo)
docs/code-philosophy.md         (nuevo)
docs/qa-approach.md             (nuevo)
docs/presentation-outline.md    (nuevo)
docs/presentation/**            (nuevo: imágenes o diagramas de la presentación)
docs/WORK-SPLIT.md, docs/ai-briefs/**   (si hay que corregir el reparto)
```

## NO TOQUES (solo lectura)

Todo lo demás, en particular:
- `src/**` y `tests/**`;
- `package.json`, `playwright.config.ts`, `scripts/**`;
- los docs de los demás: `docs/vision-approaches.md` (B), `docs/reports-and-logs.md` y `docs/test-isolation.md` (C), `docs/demo-runbook.md` (D).

## Entregables

1. **`docs/why-typescript.md`**:
   - tipos en los contratos (`Step<I, O>` en `src/steps/step.ts`), con errores detectados antes de ejecutar con dinero real (`npx tsc --noEmit`);
   - Playwright nativo en TS, un solo lenguaje para la web y los tests;
   - `sharp` y `tesseract.js` sin Python;
   - qué perderíamos con Python o Java.
2. **`docs/code-philosophy.md`**: SOLID con **un ejemplo real por principio**:
   - S: cada paso de `src/steps/*.steps.ts` hace una sola cosa;
   - O: `src/vision/controls/game-controls.ts`, donde un proveedor nuevo es una fábrica nueva;
   - L: cualquier `ScreenTarget` (`screen-target.ts`) es intercambiable en la cascada;
   - I: `StepContext` mínimo;
   - D: los escenarios dependen de abstracciones (`tests/scenarios/scenario1-real-play-spin.spec.ts`).

   Explica también los pasos atómicos, las cascadas de estrategias, los reintentos solo en lecturas (nunca en tiradas) y el aislamiento de errores (`src/steps/runner.ts`).
3. **`docs/qa-approach.md`**:
   - «ver como un jugador»: el clic no es prueba, la pantalla sí;
   - comprobación previa antes de gastar dinero (`src/utils/preflight.ts`);
   - cuadre del saldo en el juego y en Betsson;
   - pirámide de tests: unit offline con fotogramas reales → calibración sin dinero → escenarios reales;
   - riesgos cubiertos y no cubiertos.
4. **`docs/presentation-outline.md`**: puntos o diapositivas con minutaje, **total ≤ 7 min**, dejando **≤ 4 min para la demo de D**.
5. Al final, en `README.md`: una sección «Documentación» con enlaces a todos los docs (los tuyos y los de B, C y D).

## Peticiones típicas a otros

- A **B**, C y D: un párrafo-resumen de su parte para la presentación.
- A **D**: la duración real de la demo para ajustar el minutaje.

## Terminado cuando

- Los 4 docs existen, con rutas y fragmentos reales.
- `node scripts/check-ownership.cjs A` → OK, `npx tsc --noEmit` y `npm run unit` en verde (no deberías haber tocado código).
