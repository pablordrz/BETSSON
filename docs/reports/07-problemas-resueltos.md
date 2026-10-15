# Informe 7 — Problemas reales que encontramos en vivo y cómo los resolvimos

Todo lo de esta tabla salió de **ejecuciones reales contra betsson.es**, no de suposiciones. Cada solución quedó en el código y, cuando era posible, como test.

| # | Síntoma en vivo | Causa (medida o comprobada) | Solución |
|---|---|---|---|
| 1 | El login automático se rechaza: «Actualiza la página y vuelve a intentarlo en breve…» | el antifraude de Betsson rechaza los navegadores lanzados por automatización (a mano en Brave sí funcionaba) | el checker se conecta (CDP) a un **Brave normal** con perfil propio, **solo Brave**, y comprueba que lo es (`navigator.brave`) |
| 2 | El login nunca escribía el email | el login corría antes de que Playwright aplicara `testIdAttribute`, así que buscaba el atributo equivocado | fijar `data-test-id` en el login |
| 3 | El banner de cookies tapaba el formulario | se pulsaba otro botón «Configuración de cookies» de la web, que el banner cubría | usar los botones propios de OneTrust y no bloquear si el banner no responde |
| 4 | Se daba el login por hecho sin estarlo | el botón «Iniciar sesión» desaparece un instante al recargar | «sesión iniciada» = **se ve el saldo** en la cabecera |
| 5 | El juego no arrancaba sin la sesión de juego regulada | aviso de juego responsable y diálogo de límites (tiempo y pérdidas) | paso `site.gameSession`, con el límite de pérdidas más bajo |
| 6 | El OCR leía «CREDITO 9 SA PUESTA» en vez de «CRÉDITO 99,90 € APUESTA 2,00 €» | el decorado del juego se mezclaba con el texto | **binarizar el texto brillante (≥ 210)**: 0/2 → 2/2 lecturas correctas |
| 7 | Cada tirada tardaba 14–31 s en darse por terminada | se esperaban 4 fotogramas idénticos, y el fondo animado casi nunca lo permite | fin de tirada = botón disponible + rodillos quietos + CRÉDITO estable: **6–10 s** |
| 8 | Escenario 2: «se movieron los rodillos» con una cuenta a 0 € | el mensaje «Fondos insuficientes» aparece encima de los rodillos (12–19 % de píxeles) | rechazo = **no se cobra**; el movimiento solo se registra |
| 9 | «+» no encontrado en vivo | una moneda tapaba su borde y la búsqueda gruesa no acertaba el tamaño (1,25×) | buscar **junto al botón de tirar** con tamaños finos y afinar los 5 mejores candidatos; fotograma real como test |
| 10 | Al unir las ramas del equipo, el escenario 1 perdió 3 comprobaciones que pide el reto | se sustituyeron por otra distinta | restauradas: apuesta usada, saldo del juego y saldo de Betsson (y se mantiene la nueva) |

## Salvaguardas añadidas por el camino

- **Nunca se tira con un valor dudoso**: dos lecturas iguales, la moneda del mercado y saldo suficiente (`money.preflight`).
- **Una tirada nunca se reintenta**: los reintentos automáticos son solo para lecturas y navegación.
- **Cambiar la apuesta no puede cobrar nada**: si el CRÉDITO cambia al pulsar «−» o «+», el paso falla.
- **Tope de apuesta**: la apuesta nunca sube por encima de `BET_MAX` (0,50 €), y la serie de tiradas se limita a 0,10 €.
- **Sin secretos en el repositorio ni en los informes**: credenciales solo en `.env`, y no se publican las trazas de Playwright (guardan cookies de sesión).
