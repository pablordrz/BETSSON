# Contexto común (va incluido en cada brief)

## El proyecto

Es un checker para el reto *Intelligent Game Validation* de Betsson (Malackathon 2026). Valida juegos de **Pragmatic Play** en **betsson.es** en Real Play **como un jugador**: lee la pantalla (OCR + visión) y **nunca usa el DOM del juego**.

Está hecho con TypeScript y Playwright. Se ejecuta en un **Brave abierto por el equipo** (`npm run browser:fresh`) al que Playwright se conecta por CDP (`CDP_URL` en `.env`), porque Betsson rechaza los navegadores que lanza Playwright.

## Arquitectura

Lee `README.md` antes de empezar.

- `src/steps/`: **pasos atómicos**. Cada paso detecta dónde está, actúa como un jugador, valida en pantalla y deja log.
  - Contrato: `src/steps/step.ts`. Ejecutor: `src/steps/runner.ts`.
  - Catálogo: `src/steps/index.ts`.
  - Las pruebas son secuencias de pasos (`tests/scenarios/*.spec.ts`).
- `src/vision/`: visión.
  - OCR: `ocr.ts`, `hud.ts`.
  - Template matching ZNCC: `template.ts`.
  - Movimiento: `motion.ts`. Fin de tirada: `settle.ts`. Apuesta: `bet.ts`.
  - Controles: `controls/` (`ScreenTarget`, `PlayerAction`, `GameControls`).
- `src/pages/`: la web de Betsson (login, juego, sesión de juego regulada, saldo).
- `src/reporter/` y `src/utils/checks.ts`: el informe PASS/FAIL/INFO.
- `tests/unit/`: tests offline, con fotogramas reales en `tests/unit/fixtures/`.

## Cómo ejecutar

En Windows, si `node` no está en el PATH: `$env:Path = "C:\Program Files\nodejs;$env:Path"`.

```bash
npm ci
npx tsc --noEmit          # 0 errores
npm run unit              # todos en verde
npm run browser:fresh     # Brave limpio (dejarlo abierto)
npm run calibrate         # en vivo, SIN tirada
```

## Reglas que NO se negocian

1. **Solo editas los archivos de tu lista «PUEDES TOCAR».** Todo lo demás es solo lectura. Si necesitas un cambio fuera, **no lo hagas**: anótalo en «Peticiones a otros» del PR y avisa al dueño. Él lo hace en un PR pequeño aparte.
2. **Contratos congelados.** Nadie cambia:
   - `src/steps/step.ts`, `src/steps/*.steps.ts`, `src/steps/index.ts`;
   - `tests/scenarios/**`, `src/config/**`, `src/auth/**`;
   - `tsconfig.json`, `scripts/check-ownership.cjs`.

   En general, **todo archivo que no esté en la lista de nadie** (`scripts/check-ownership.cjs`) está congelado: `src/utils/{money,text,preflight}.ts`, `src/vision/{annotate,spin}.ts`, `tests/calibrate.spec.ts`, `tests/series/**`… Lo nuevo va en **archivos nuevos** dentro de tus rutas. Si de verdad hay que cambiar algo congelado, se hace en un PR pequeño aparte, acordado por el equipo.
3. **Dependencias nuevas** (`npm install …`): solo las añade **D**, en un PR pequeño que se mergea antes que el tuyo. Si las necesitas, pídeselas a D. Nunca toques `package.json` ni `package-lock.json`.
4. **Sin secretos**: nada de credenciales, cabeceras `x-obg-*`, `.env` ni `.auth/` en el código, los docs, las capturas o los commits.
5. **Dinero real**: solo **D** ejecuta `npm test`, `npm run spins` y `npm run demo`. Los demás: `npm run unit`, `npm run calibrate` (sin tirada) y fotogramas guardados.
6. **Juego responsable**: no cambies cómo se tratan el aviso ni los límites de la sesión de juego. Siempre las opciones más protectoras.
7. **Firmas**: si optimizas un archivo tuyo que otros importan, **no cambies sus funciones exportadas** (nombre, parámetros ni tipo de retorno). Solo el interior.

## Flujo de git

```bash
git checkout main && git pull
git checkout -b <tu-rama>
# … trabajo, commits pequeños …
git fetch origin && git rebase origin/main     # antes de abrir el PR
node scripts/check-ownership.cjs <A|B|C|D>     # DEBE decir OK
npx tsc --noEmit && npm run unit               # DEBEN pasar
git push -u origin <tu-rama>                   # y abrir el PR contra main
```

Orden de merge: **dependencias de D (si las hay) → C → B → D → A**.

## Antes de abrir el PR

- [ ] `node scripts/check-ownership.cjs <tu letra>` → `OK`
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run unit` en verde
- [ ] Sin secretos (busca tu usuario, contraseñas y `x-obg` en el diff)
- [ ] Descripción del PR: qué cambia, cómo se prueba y «Peticiones a otros»
