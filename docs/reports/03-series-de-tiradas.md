# Informe 3 — Series de tiradas: el saldo tirada a tirada

Dos ejecuciones reales del 15/10/2026 con la **apuesta mínima (0,10 €)**.

## Serie de 5 tiradas (`npm run all`, parte 3) — ✅

15:12–15:14 · 2,1 min. Al final se sale del juego y el saldo de Betsson en la página tiene que coincidir con el último CRÉDITO.

| Tirada | CRÉDITO antes | Apuesta | Premio | CRÉDITO después | Fin de tirada detectado en |
|---|---|---|---|---|---|
| 1 | 106,16 € | 0,10 € | 0,00 € | 106,06 € (*) | — |
| 2 | 106,06 € | 0,10 € | 0,00 € | 105,96 € | 5,9 s |
| 3 | 105,96 € | 0,10 € | 0,00 € | 105,86 € | 6,0 s |
| 4 | 105,86 € | 0,10 € | **0,16 €** | **105,92 €** | 10,0 s |
| 5 | 105,92 € | 0,10 € | 0,00 € | 105,82 € | 9,7 s |
| **Al salir** | | | | **Betsson (página) 105,82 € = juego 105,82 €** ✅ | |

(*) La línea de log de la tirada 1 no quedó en el extracto guardado. El valor se deduce de la tirada 2, que empieza en 106,06 €, y cuadra con la regla `después = antes − apuesta + premio`.

En la tirada 4 hubo **premio**: 105,86 − 0,10 + 0,16 = 105,92 €. La animación de premio mantiene la pantalla en movimiento; aun así, el final se detectó porque el CRÉDITO dejó de cambiar durante 5 lecturas y el botón volvió a estar disponible (10,0 s).

## Demo rápida de 10 tiradas (`npm run demo`) — ✅

14:15–14:19 · primera versión, sin comprobaciones (solo para ver el saldo evolucionar).

| Tirada | CRÉDITO | Duración |
|---|---|---|
| 1 | 99,76 → 99,82 € | 30,8 s |
| 2 | 99,82 → 99,72 € | 15,6 s |
| 3 | 99,72 → 99,62 € | 15,9 s |
| 4 | 99,62 → 99,92 € | 24,7 s |
| 5 | 99,92 → 99,82 € | 14,1 s |
| 6 | 99,82 → 99,72 € | 16,1 s |
| 7 | 99,72 → 100,02 € | 24,1 s |
| 8 | 100,02 → 99,92 € | 15,5 s |
| 9 | 99,92 → 99,82 € | 13,9 s |
| 10 | 99,82 → 99,82 € | 25,3 s |

Hubo 4 tiradas con premio (1, 4, 7 y 10), y el saldo terminó casi igual que empezó (99,76 → 99,82 €).

## Velocidad: lo que mejoramos

| | Demo inicial (14:15) | Serie con la detección rápida (15:12) |
|---|---|---|
| Tiempo por tirada | 14–31 s | **6–10 s** |
| Cómo se detecta el final | esperar 4 fotogramas idénticos (con el fondo animado casi nunca ocurre) | botón disponible + rodillos quietos + CRÉDITO estable |

La serie guarda además una **gráfica de la evolución del saldo** en el informe de Playwright (`balance-evolution`).
