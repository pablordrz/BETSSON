# Brief para la IA de la persona B — Visión: enfoques y alternativas

> Lee primero `docs/ai-briefs/_COMMON.md` (contexto, reglas y flujo de git). Este archivo **amplía** ese contexto y no lo sustituye.

**Rama:** `feat/vision-approaches` · **Letra para el check:** `B`

## Tu misión

Explicar **y demostrar con mediciones** por qué usamos cada técnica de visión, e implementar **al menos una alternativa** que refuerce la cascada para encontrar botones.

Técnicas actuales:
- **Template matching ZNCC** con máscara circular para los iconos (`src/vision/template.ts`, `TemplateTarget`).
- **OCR** con binarización de texto brillante para el HUD (`src/vision/ocr.ts`, `hud.ts`). Este archivo es de D: solo lectura para ti.
- **Diferencia de fotogramas** para el movimiento (`motion.ts`). También de D: solo lectura.

Alternativas a comparar: segmentación de imagen, Hough Circles, YOLO/SSD, modelos de visión-lenguaje y puntos clave (ORB/SIFT).

## PUEDES TOCAR (solo esto)

```
docs/vision-approaches.md                (nuevo)
src/vision/controls/**                   (archivos NUEVOS: hough-target.ts, segmentation-target.ts, vlm-target.ts…)
src/vision/controls/game-controls.ts     (solo para AÑADIR tus objetivos a la cascada)
src/vision/controls/screen-target.ts     (solo optimización interna; NO cambies firmas exportadas)
src/vision/template.ts                   (solo optimización interna; NO cambies firmas exportadas)
assets/templates/**                      (plantillas nuevas)
scripts/bench-vision*                    (nuevo: benchmark offline)
tests/unit/vision-approaches.spec.ts     (nuevo)
tests/unit/fixtures/vision/**            (fotogramas nuevos SIN datos personales)
```

## NO TOQUES (solo lectura)

- `src/steps/**` (congelado);
- `src/vision/{hud,ocr,motion,settle,bet,game-screen}.ts` (de D);
- `src/reporter/**`, `tests/fixtures.ts`, `playwright.config.ts` (de C);
- `tests/scenarios/**`, `tests/unit/vision.spec.ts` y `tests/unit/fixtures/pragmatic-triple-hop-pots.png` (se usan como referencia, no se cambian);
- `package.json` / `package-lock.json`. **Si necesitas OpenCV u ONNX, pídeselo a D** antes de usarlo.

## Entregables

1. **`docs/vision-approaches.md`**:
   - tabla por problema (botón de tirar, HUD crédito/apuesta, movimiento de rodillos, mensaje de saldo insuficiente);
   - para cada técnica: tiempo, acierto, coste, explicabilidad y dependencias;
   - por qué elegimos lo que elegimos.
2. **Una o dos implementaciones nuevas de `ScreenTarget`.** Implementan `locate(frame): Promise<TargetMatch | null>` con coordenadas relativas (0–1).
   - **Recomendado `HoughCircleTarget`:** el círculo grande de la zona inferior, confirmado por contraste del centro. Sin dependencias nuevas si es posible (con `sharp` y píxeles en bruto).
   - Opcional, `VlmTarget`: detrás de una variable de entorno, **desactivado por defecto**, sin claves en el repo.
3. **Cascada** en `pragmaticControls()`: plantilla → **tu alternativa** → ESPACIO → posición calibrada. El orden de la plantilla no cambia.
4. **Benchmark offline** (`scripts/bench-vision.*`) sobre `tests/unit/fixtures/**`:
   - distancia al centro real;
   - tiempo medio;
   - falsos positivos en una imagen sin botón.

   Debe imprimir una tabla.
5. **Tests unitarios** en `tests/unit/vision-approaches.spec.ts` con fotogramas reales.

## Peticiones típicas a otros

- A **D** (único que ejecuta en vivo): fotogramas de estados concretos (intro, rodillos girando, premio, saldo insuficiente), sin datos personales.
- A **D**: dependencias nuevas, si de verdad hacen falta.

## Terminado cuando

- `npm run unit` en verde, con tus tests incluidos, y el benchmark imprime la tabla.
- El escenario 1 no cambia: sus pasos y su contrato siguen iguales.
- `node scripts/check-ownership.cjs B` → OK.
