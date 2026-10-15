# Informe 8 — Calidad, tests y arquitectura

## Tests offline: 42 superados

Se ejecutan con `npm run unit`, sin navegador ni dinero, sobre **fotogramas reales del juego**.

| Archivo | Qué demuestra |
|---|---|
| `tests/unit/vision.spec.ts` | lectura de importes (es-ES), **OCR del HUD sobre un fotograma real** (99,90 € / 2,00 €), botón de tirar, «−» y «+» encontrados por imagen, el «+» con una moneda encima (fotograma en vivo) |
| `tests/unit/vision-approaches.spec.ts` | plantilla, Hough y segmentación sobre fotogramas reales, el orden de la cascada y 0 falsos positivos |
| `tests/unit/preflight.spec.ts` | la protección que solo permite tirar con saldo, apuesta y moneda bien leídos |
| `tests/unit/steps.spec.ts` | ejecutor de pasos atómicos: paso de datos, aislamiento de errores, reintentos solo en lecturas (**nunca en tiradas**) |
| `tests/unit/reporter.spec.ts` | informe solo de fallos: requisitos por paso, con captura y porqué solo en los fallos |

## Arquitectura: pasos atómicos

Cada recorrido es una **secuencia de pasos atómicos** (`src/steps/`). Un paso **detecta** dónde está, **actúa** como un jugador, **valida en pantalla** y **registra** lo que leyó. Así cada miembro del equipo podía trabajar y optimizar un paso sin tocar los demás.

```
site.loggedIn → site.goToGame → site.gameSession → game.attach → game.enter → game.minBet → (game.raiseBet)
→ betsson.readBalance → game.readHud → money.preflight → game.idleNoise → game.spin → game.spinEnd
→ money.wagerUsed → money.game → money.betsson → site.exitBalance
```

- **Principios SOLID:**
  - cada paso hace una cosa;
  - los controles de un proveedor son una fábrica (`pragmaticControls`): otro proveedor sería otra fábrica;
  - las técnicas de visión son intercambiables (`ScreenTarget`: plantilla, Hough, OCR, «junto a», posición fija);
  - los escenarios dependen de abstracciones, no de coordenadas.
- **Cascadas**: si una técnica no encuentra un control, se prueba la siguiente; el clic nunca es la prueba.
- **Logs por paso** (`▶ · ✓ ✗ ! ↻`) con lo que se leyó en pantalla y el tiempo, más un `steps.jsonl` adjunto a cada test.
- **Informe solo de fallos**: cada fallo con su captura, lo esperado, lo observado y el log; los aciertos solo se cuentan.

## Comandos

| Comando | Qué hace | Dinero |
|---|---|---|
| `npm run unit` | 42 tests offline | no |
| `npm run calibrate` | abre el juego y guarda lo que ve el checker | no |
| `npm run all` | escenarios 1 y 2, serie de 5, «+» y demo de fallo, cada uno en un Brave limpio, con un informe unido | ~0,90 € |
| `npm run bet:raise` | subir la apuesta con «+» y tirar una vez | ~0,20 € |
| `npm run report:demo` | demo del informe con un fallo provocado | 0,10 € |
| `node scripts/bench-vision.cjs` | benchmark de visión y sus gráficas | no |
| `npm run reports:html` | genera estos informes en HTML (`docs/reports/html/`) | no |
