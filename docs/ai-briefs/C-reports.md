# Brief para la IA de la persona C — Logs, informes y aislamiento de tests

> Lee primero `docs/ai-briefs/_COMMON.md` (contexto, reglas y flujo de git). Este archivo **amplía** ese contexto y no lo sustituye.

**Rama:** `feat/reports-isolation` · **Letra para el check:** `C`

## Tu misión

1. **Logs y registros detallados**: que en cada paso se vea qué falla y qué datos se leyeron en pantalla.
2. **Informe con solo los fallos**: captura + qué se esperaba + qué se observó + **por qué**. Los aciertos van resumidos, sin imágenes.
3. **Aislamiento de tests**: cada test independiente y reproducible.

Tu PR se mergea **el primero** (tras las dependencias de D, si las hay): eres la base de los demás.

## PUEDES TOCAR (solo esto)

```
src/steps/runner.ts            (NO cambies las firmas: run(), must(), StepResult, attachLog())
src/utils/checks.ts            (NO cambies las firmas de check(), info(), image(), json())
src/reporter/**                (checks-reporter.ts, balance-chart.ts y nuevos)
merge.config.ts
playwright.config.ts           (reporters, trace, video, screenshot, proyectos de test)
tests/fixtures.ts              (NO cambies los nombres ni tipos de los fixtures existentes)
tests/unit/steps.spec.ts
tests/unit/reporter.spec.ts    (nuevo)
tests/unit/isolation.spec.ts   (nuevo)
docs/reports-and-logs.md       (nuevo)
docs/test-isolation.md         (nuevo)
.gitignore
ci/**, .github/**              (workflow de GitHub Actions)
```

## NO TOQUES (solo lectura)

- `src/steps/step.ts`, `src/steps/*.steps.ts`, `src/steps/index.ts` (congelados);
- `src/vision/**` (de B y D) y `src/pages/**` (de D);
- `tests/scenarios/**` (congelado) y `tests/demo/**` (de D);
- `package.json` / `package-lock.json` (de D).

## Entregables

1. **Evidencias solo en los fallos** (`src/steps/runner.ts` + `src/utils/checks.ts`):
   - Por defecto, una captura **solo cuando un paso falla**, con: lo esperado, lo observado, el porqué (`detail` del paso) y la última línea de log del paso.
   - Los PASS salen como una fila compacta, sin imágenes.
   - Variable `EVIDENCE=all|failures` (por defecto `failures`).
   - Traza y vídeo solo si falla (`retain-on-failure` en `playwright.config.ts`).
2. **Logs** (`runner.ts`):
   - formato coherente (ya existe `▶ · ✓ ✗ ! ↻`);
   - nivel `STEP_LOGS=0|1|debug`;
   - **resumen final de tiempos por paso**, del más lento al más rápido (D lo usa para optimizar la demo);
   - `steps.jsonl` adjunto siempre.
3. **Informe** (`src/reporter/checks-reporter.ts`): una tabla por escenario y mercado, primero los fallos con su captura y su porqué, luego los aciertos plegados. Que se lea en 10 segundos en la presentación.
4. **Aislamiento**:
   - cada test empieza en un estado conocido (contexto propio, sin depender del orden);
   - los tests unitarios no tocan la red ni el navegador;
   - documentar el estado compartido de los tests en vivo (Brave por CDP: sesión, pestañas abiertas) y cómo limpiarlo entre tests (cerrar pestañas extra, volver a la ficha del juego). Implementarlo en `tests/fixtures.ts` si hace falta.
5. **GitHub Actions** (opcional si da tiempo): mover `ci/game-validation.yml` a `.github/workflows/`, con un runner propio en España y publicación del informe.
6. **Docs**: `docs/reports-and-logs.md` (cómo leer el informe y los logs) y `docs/test-isolation.md`.

## Peticiones típicas a otros

- Si un paso necesita devolver más contexto para el «porqué», pídeselo a quien lo necesite y propón el cambio en un PR aparte (los pasos están congelados). Mientras tanto, usa `detail`.

## Terminado cuando

- `npm run unit` en verde, con tests nuevos:
  - el runner solo adjunta capturas en los fallos;
  - el reporter genera la tabla.
- Un informe de ejemplo muestra 1 fallo con captura y su porqué, y los aciertos sin imágenes.
- `node scripts/check-ownership.cjs C` → OK.
