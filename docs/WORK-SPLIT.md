# Reparto del trabajo — 4 personas, 0 conflictos al mergear

Este documento sirve para dos cosas:
- Que **cada asistente de IA** (uno por compañero) pueda trabajar solo, sin pisar a los demás.
- Que el merge en `main` sea limpio.

**Para cada IA:** pásale `docs/ai-briefs/_COMMON.md` y su brief (`A-narrativa.md`, `B-vision.md`, `C-reports.md` o `D-demo.md`).
**Fuente de verdad de la propiedad de archivos:** `scripts/check-ownership.cjs`. Antes de cada PR, cada persona ejecuta `node scripts/check-ownership.cjs <A|B|C|D>`, que falla si ha tocado algo que no es suyo.

| Persona | Bloque | Tareas de la lista | Rama |
|---|---|---|---|
| **A** | Narrativa y presentación | 1) Por qué TypeScript · 2) Filosofía SOLID · 6) Nuestro enfoque de QA | `docs/narrative` |
| **B** | Visión: enfoques y alternativas | 3) Enfoques de arquitectura: OCR, template matching, segmentación… | `feat/vision-approaches` |
| **C** | Logs, informes y aislamiento | (Jorge) logs, registros y tests detallados · 4) *Testing isolation* · 5) Informes con solo los fallos, su captura y el porqué | `feat/reports-isolation` |
| **D** | Demo rápida | 7) Demo que funcione en menos de 7 minutos | `feat/fast-demo` |

> La tarea 4 venía escrita como «traimiing isolation». La interpretamos como **testing isolation**: cada test y cada paso independientes y reproducibles. Si se refería a otra cosa, avisad a C.

---

## Contexto común (pegar SIEMPRE en el asistente)

**Proyecto.** Es un checker para el reto *Intelligent Game Validation* de Betsson (Malackathon 2026). Valida juegos de Pragmatic Play en betsson.es en Real Play **como un jugador**: lee la pantalla con OCR y visión y nunca usa el DOM del juego. Está hecho con TypeScript y Playwright. Se ejecuta en un **Brave abierto por nosotros** al que Playwright se conecta por CDP, porque Betsson rechaza los navegadores que lanza Playwright.

**Arquitectura que ya existe** (lee `README.md` antes de empezar):
- `src/steps/`: **pasos atómicos**. Cada uno detecta dónde está, actúa como un jugador, valida en pantalla y deja log. El contrato está en `src/steps/step.ts` y el ejecutor en `src/steps/runner.ts`. Las pruebas son secuencias de pasos (`tests/scenarios/*.spec.ts`).
- `src/vision/`: OCR (tesseract.js), template matching ZNCC (`template.ts`), movimiento (`motion.ts`), fin de tirada (`settle.ts`) y controles del juego (`controls/`: `ScreenTarget`, `PlayerAction`, `GameControls`).
- `src/pages/`: la web de Betsson (login, juego, sesión de juego regulada, saldo).
- `src/reporter/`: informe de comprobaciones (`checks-reporter.ts`) y gráfica de saldo.
- `src/utils/checks.ts`: filas PASS/FAIL/INFO del informe.

**Cómo ejecutar** (en Windows, si `node` no está en el PATH: `$env:Path = "C:\Program Files\nodejs;$env:Path"`):
```bash
npm ci
npx tsc --noEmit          # debe dar 0 errores
npm run unit              # tests offline: deben pasar todos
npm run browser:fresh     # Brave limpio (dejarlo abierto)
npm run calibrate         # en vivo, SIN tirada
npm test                  # escenarios 1 y 2 (⚠ tirada real)
npm run demo              # tiradas rápidas (⚠ dinero real)
```

**Reglas obligatorias para todos**
1. **Solo edita los archivos de tu sección («Te pertenecen»).** Si necesitas cambiar un archivo de otra persona, **no lo toques**: anótalo en la sección «Peticiones a otros» de tu PR y avisa.
2. **Contratos congelados**: nadie cambia las firmas de `src/steps/step.ts`, `Step`/`StepOutcome`/`StepContext`, ni las entradas y salidas de los pasos de `src/steps/*.steps.ts`. Los pasos o técnicas nuevos van en **archivos nuevos**.
3. **Sin secretos**: nada de credenciales, cabeceras `x-obg-*`, `.env` ni `.auth/` en el código, los docs, las capturas o los commits.
4. **Dinero real**: solo **D** ejecuta tiradas reales (`npm test`, `npm run spins`, `npm run demo`), siempre con apuesta mínima. Los demás usan `npm run unit`, `npm run calibrate` (sin tirada) y los fotogramas de `tests/unit/fixtures/`.
5. **No automatizar** el aviso de juego responsable ni los límites de forma distinta a la actual (siempre las opciones más protectoras).
6. Antes de abrir el PR: `npx tsc --noEmit` sin errores y `npm run unit` en verde.
7. Commits pequeños, en tu rama. PR contra `main`. Al final del mensaje de commit: `Co-Authored-By: <tu asistente>`.

**Orden de merge**: **dependencias de D (si las hay) → C → B → D → A**.
- C toca la infraestructura (runner e informe), así que va primero.
- B y D no se solapan con nadie.
- A va al final para describir lo que realmente ha quedado.

---

## A — Narrativa y presentación (tareas 1, 2 y 6)

**Objetivo.** Los textos que explicaremos en la presentación de 7 minutos y en el informe:
- por qué TypeScript;
- la filosofía del código (SOLID);
- nuestro enfoque de QA.

Deben ser claros, con ejemplos **del código real** (rutas y fragmentos cortos), sin relleno.

**Te pertenecen (solo tú los editas)**
- `docs/why-typescript.md` (nuevo)
- `docs/code-philosophy.md` (nuevo)
- `docs/qa-approach.md` (nuevo)
- `docs/presentation-outline.md` (nuevo): guion de 7 minutos con minutaje
- `README.md`: solo para enlazar los docs de todos al final (tú haces el último merge)

**Solo lectura**: todo el resto del repo.

**Entregables**
1. `why-typescript.md`:
   - tipos en los contratos de pasos (`Step<I, O>`), detección temprana de errores (`tsc`), Playwright nativo, un solo lenguaje web + tests, `sharp` y `tesseract.js` sin Python;
   - qué perderíamos con Python o Java.
2. `code-philosophy.md`: SOLID **con un ejemplo real por principio**:
   - S: cada paso hace una cosa;
   - O: `GameControls`, donde un proveedor nuevo es una fábrica nueva;
   - L: cualquier `ScreenTarget` es intercambiable;
   - I: `StepContext` mínimo;
   - D: los escenarios dependen de abstracciones.

   Incluye también pasos atómicos, cascadas de estrategias y resiliencia (reintentos solo en lecturas, nunca en tiradas).
3. `qa-approach.md`:
   - «ver como un jugador»: el clic no es prueba, la pantalla sí;
   - comprobación previa antes de gastar dinero;
   - verificación del saldo en el juego y en Betsson;
   - pirámide de tests: unit offline con fotogramas reales → calibración sin dinero → escenarios reales;
   - qué riesgos cubrimos y cuáles no.
4. `presentation-outline.md`: diapositivas o puntos con minutaje (total ≤ 7 min), dejando hueco para la demo de D, que dura menos de 4 min.

**Criterio de terminado**: cada afirmación técnica apunta a un archivo real del repo. Nada que el código no haga.

**Peticiones a otros**: pide a B y C un párrafo-resumen de sus docs para enlazarlo.

---

## B — Visión: enfoques y alternativas (tarea 3)

**Objetivo.** Explicar **y demostrar** por qué usamos cada técnica (OCR para texto y números, template matching ZNCC para iconos, diferencia de fotogramas para el movimiento) frente a las alternativas (segmentación de imagen, Hough, YOLO, modelos de visión-lenguaje). Implementar **al menos una alternativa** como `ScreenTarget` nuevo, para que la cascada tenga respaldo.

**Te pertenecen**
- `docs/vision-approaches.md` (nuevo)
- `src/vision/controls/game-controls.ts`: solo para **añadir** tus objetivos a la cascada
- **Archivos nuevos** en `src/vision/controls/` (p. ej. `hough-target.ts`, `segmentation-target.ts`, `vlm-target.ts`)
- `src/vision/template.ts` y `src/vision/controls/screen-target.ts`: solo optimizaciones internas **sin cambiar firmas**
- `assets/templates/**` (plantillas nuevas)
- `tests/unit/vision-approaches.spec.ts` (nuevo)
- Scripts de comparación en `scripts/bench-vision.*` (nuevo)

**Solo lectura**: `src/steps/**`, `src/vision/hud.ts`, `ocr.ts`, `settle.ts`, `motion.ts`, `tests/**` (excepto tu archivo).

**Entregables**
1. `vision-approaches.md`: tabla comparativa con tiempo, precisión, coste, explicabilidad y dependencias, y por qué elegimos cada técnica para cada problema:
   - botón de tirar;
   - HUD (crédito y apuesta);
   - movimiento de los rodillos;
   - mensaje de saldo insuficiente.
2. Una o dos implementaciones nuevas de `ScreenTarget`. Recomendado `HoughCircleTarget`: el círculo grande de la zona inferior, confirmado por el contraste del centro. Opcional: un `VlmTarget` detrás de una variable de entorno, desactivado por defecto.
3. **Benchmark offline** sobre `tests/unit/fixtures/pragmatic-triple-hop-pots.png` y sobre capturas nuevas (sin datos personales):
   - acierto (distancia al centro real);
   - tiempo medio;
   - falsos positivos sobre una imagen sin botón.
4. Tests unitarios de tus objetivos, con fotogramas reales.

**Criterio de terminado**: `npm run unit` en verde; el benchmark imprime una tabla; la cascada sigue siendo plantilla → **tu alternativa** → ESPACIO → posición calibrada, y el escenario 1 no cambia.

**Peticiones a otros**: si necesitas un fotograma en un estado concreto (intro, tirada, premio, saldo insuficiente), pídeselo a D, que es quien ejecuta en vivo.

---

## C — Logs, informes y aislamiento (tareas de Jorge, 4 y 5)

**Objetivo.**
- Logs útiles para encontrar qué falla y qué se leyó en pantalla.
- Un informe que **guarde solo los fallos, con su captura y el porqué**; los aciertos van resumidos.
- Tests aislados y reproducibles.

**Te pertenecen**
- `src/steps/runner.ts`: logs, evidencias, política de capturas. **Sin cambiar** las firmas `run`/`must`/`StepResult`.
- `src/utils/checks.ts`
- `src/reporter/**` (`checks-reporter.ts`, `balance-chart.ts`, nuevos)
- `merge.config.ts`
- `playwright.config.ts`: **reporters, trace, video y screenshot**. Si añades proyectos, coordínalo con D.
- `tests/fixtures.ts`
- `tests/unit/steps.spec.ts`, `tests/unit/reporter.spec.ts` (nuevo), `tests/unit/isolation.spec.ts` (nuevo)
- `docs/reports-and-logs.md` y `docs/test-isolation.md` (nuevos)

**Solo lectura**: `src/steps/*.steps.ts`, `src/vision/**`, `src/pages/**`, `tests/scenarios/**`, `tests/demo/**`.

**Entregables**
1. **Informe solo de fallos**:
   - Por defecto, las evidencias (capturas) se guardan **solo en los pasos que fallan**, con:
     - qué se esperaba;
     - qué se observó;
     - el porqué (el detalle del paso);
     - la última línea de log del paso.
   - Los PASS aparecen como una fila compacta, sin imágenes.
   - Variable `EVIDENCE=all|failures` (por defecto `failures`).
   - La traza o el vídeo se conservan solo si el test falla (`retain-on-failure`).
2. **Logs**:
   - un formato coherente por paso (ya existe `▶ · ✓ ✗ ! ↻`);
   - nivel configurable (`STEP_LOGS=0|1|debug`);
   - un resumen al final con el tiempo por paso, ordenado del más lento al más rápido, para que D sepa qué optimizar;
   - `steps.jsonl` adjunto siempre.
3. **Aislamiento**:
   - cada test empieza en un estado conocido: contexto propio, sin depender del orden;
   - los tests unitarios no tocan la red ni el navegador;
   - documentar qué estado comparten los tests en vivo (sesión de Brave por CDP) y cómo evitar que uno contamine al siguiente (por ejemplo, cerrar pestañas extra o volver a la ficha del juego).
4. `docs/reports-and-logs.md` y `docs/test-isolation.md`: cómo leer el informe y los logs, y cómo ejecutar una sola prueba o un solo paso.

**Criterio de terminado**:
- `npm run unit` en verde, con tests del runner (solo captura en los fallos) y del reporter;
- un informe de ejemplo generado con `npm run unit` o `calibrate` que muestra 1 fallo con captura y su porqué, y los aciertos sin imágenes.

**Peticiones a otros**: si un paso necesita devolver más contexto para el «porqué», pídelo al dueño del paso. Mientras tanto, usa `detail`.

---

## D — Demo rápida en menos de 7 minutos (tarea 7)

**Objetivo.** Una ejecución en vivo **fiable y rápida** para la presentación: de Brave limpio a varias tiradas con el saldo cuadrado, en **menos de 4 minutos**, para que quepa en los 7 de la presentación. Eres **la única persona que ejecuta con dinero real**, siempre con apuesta mínima.

**Te pertenecen**
- `tests/demo/**`
- `scripts/open-browser.cjs` y scripts nuevos en `scripts/demo*`
- `package.json`: solo la sección `scripts`
- **Rendimiento interno, sin cambiar firmas ni contratos**:
  - `src/vision/settle.ts` y `src/vision/motion.ts`;
  - `src/vision/bet.ts`;
  - `src/vision/hud.ts` y `src/vision/ocr.ts` (velocidad del OCR);
  - `src/vision/game-screen.ts`;
  - `src/pages/betsson-site.ts` y `src/pages/betsson-wallet.ts` (esperas y navegación)
- `.env.example`
- `docs/demo-runbook.md` (nuevo)

**Solo lectura**: `src/steps/**`, `src/vision/controls/**`, `src/reporter/**`, `src/utils/checks.ts`, `tests/fixtures.ts`, `tests/scenarios/**`.

**Entregables**
1. `npm run demo` de principio a fin en menos de 4 min con 5 tiradas:
   - login → juego → sesión regulada → apuesta mínima → tiradas → saldo de Betsson cuadrado al final.
   - Hoy tarda unos 86 s en tener el juego listo y 14–30 s por tirada; el objetivo es menos de 40 s y menos de 8 s.
   - Usa el resumen de tiempos por paso de C para saber qué optimizar.
2. Una consola legible para el público: una línea por tirada (`saldo antes → después · apuesta · premio · tiempo`), y al final el resultado del cuadre.
3. **Plan B** si algo falla en directo:
   - grabación de una ejecución buena;
   - capturas;
   - `npm run calibrate` sin tirada.
4. `docs/demo-runbook.md`, el guion técnico de la demo:
   - preparación (Brave, `.env`, saldo de la cuenta, la ventana de 60 min del aviso de juego responsable);
   - comandos exactos;
   - qué decir en cada momento;
   - qué hacer si falla.
5. Capturas de estados concretos que pidan B o C (sin datos personales).

**Criterio de terminado**:
- 3 ejecuciones seguidas de `npm run demo` sin intervención, todas en menos de 4 min;
- los escenarios 1 y 2 siguen en verde con los mismos pasos;
- `npm run unit` en verde.

**Peticiones a otros**: si un paso es lento por su diseño y no por esperas, pide al dueño que lo optimice. Por ejemplo, el OCR del HUD al de la visión (B) o el número de capturas al de los informes (C).

---

## Mapa de propiedad de archivos (resumen anti-conflictos)

| Ruta | Dueño |
|---|---|
| `docs/why-typescript.md`, `docs/code-philosophy.md`, `docs/qa-approach.md`, `docs/presentation-outline.md`, `README.md` | A |
| `docs/vision-approaches.md`, `src/vision/controls/**`, `src/vision/template.ts`, `assets/templates/**`, `scripts/bench-vision.*`, `tests/unit/vision-approaches.spec.ts` | B |
| `src/steps/runner.ts`, `src/utils/checks.ts`, `src/reporter/**`, `merge.config.ts`, `playwright.config.ts`, `tests/fixtures.ts`, `tests/unit/steps.spec.ts`, `tests/unit/reporter.spec.ts`, `tests/unit/isolation.spec.ts`, `docs/reports-and-logs.md`, `docs/test-isolation.md` | C |
| `tests/demo/**`, `scripts/open-browser.cjs`, `scripts/demo*`, `package.json`, `package-lock.json`, `src/vision/{settle,motion,bet,hud,ocr,game-screen}.ts`, `src/pages/**`, `.env.example`, `docs/demo-runbook.md` | D |
| `.gitignore`, `ci/**`, `.github/**` | C |
| `src/steps/step.ts`, `src/steps/*.steps.ts`, `src/steps/index.ts`, `tests/scenarios/**`, `src/config/**`, `src/auth/**`, `tsconfig.json`, `scripts/check-ownership.cjs` | **Congelados**: cambios solo de común acuerdo, en un PR aparte |

**Dependencias nuevas:** solo las añade **D** (`package.json` y `package-lock.json`), en un PR pequeño que se mergea **antes** que el de quien las pidió. Así el lockfile nunca entra en conflicto.

Si un cambio necesita tocar una ruta congelada o de otra persona, se abre un **PR pequeño aparte** con el dueño como revisor. Nunca se mezcla en tu PR.
