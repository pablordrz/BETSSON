# Informe 2 — Escenario 2: cuenta sin saldo (la tirada queda bloqueada)

**Resultado: ✅ todas las comprobaciones superadas** · betsson.es · *Triple Hop Pots* · cuenta sin saldo · ejecución real del 15/10/2026 (15:16–15:17, 1,2 min) · **sin gastar dinero** (0 €).

## Qué pide el reto y qué se comprobó en pantalla

| Requisito del reto | Paso atómico | Lo que se vio en pantalla | Resultado |
|---|---|---|---|
| Autenticarse con la cuenta sin saldo y entrar en Real Play | `site.loggedIn` · `site.goToGame` · `site.gameSession` · `game.attach` · `game.enter` | juego listo en 6,7 s | ✅ |
| Leer el saldo antes del intento | `betsson.readBalance` · `game.readHud` | Betsson **0,00 €** · CRÉDITO **0,00 €** · APUESTA 2,00 € · EUR | ✅ |
| Intentar una tirada: rechazada, no cobrada | `game.spinRejected` | se pulsa el botón (encontrado por imagen) · la pantalla cambia un 12,3 % **por el mensaje** · CRÉDITO **0,00 → 0,00 €: no se cobra nada** | ✅ |
| Mensaje de saldo insuficiente en el idioma esperado | `game.message` | **«Fondos insuficientes…»** dentro del juego, **en español** | ✅ |
| El saldo del juego no cambia | `money.unchanged` | CRÉDITO 0,00 € → 0,00 € | ✅ |
| El saldo de Betsson no cambia | `betsson.readBalance` · `money.unchanged` | Betsson 0,00 € → 0,00 € (releído 5 s después) | ✅ |

## Log real de la ejecución (extracto)

```
15:16:38 ✓ [game.enter] playable in 6.7s · CREDIT 0.00 EUR · BET 2.00 EUR
15:16:42 ✓ [betsson.readBalance] 0.00 EUR
15:16:45 ✓ [game.readHud] CREDIT 0.00 EUR · BET 2.00 EUR
15:16:50 · [game.spinRejected] click round arrows button: found by image (spin-crown.png), score 0.85 (located by Hough)
15:16:52 · [game.spinRejected] screen changed after pressing spin {"peak":"12.3%","creditBefore":0,"creditAfter":0}
15:16:52 ✓ [game.spinRejected] max screen change 12.3% · CREDIT 0.00 EUR → 0.00 EUR · not charged
15:16:55 ✓ [game.message] "Fondos insuficientes realizar esta [" (game)
15:16:57 ✓ [money.unchanged] in-game CREDIT: 0.00 EUR → 0.00 EUR
15:17:06 ✓ [money.unchanged] Betsson balance: 0.00 EUR → 0.00 EUR
  ✓  Scenario 2 — insufficient balance (1.2m)
```

## Lo que aprendimos en vivo: «se movió la pantalla» no es «se tiró»

La primera versión daba la tirada por rechazada **solo si la pantalla no cambiaba**. En vivo falló: el propio mensaje «Fondos insuficientes» aparece **encima de los rodillos** y cambia el 12–19 % de los píxeles, y el checker lo tomó por un giro. Ahora el rechazo se comprueba como lo pide el reto («rechazada en vez de completarse como una tirada pagada»): **el CRÉDITO no se ha cobrado**. El cambio de pantalla se registra, pero ya no decide.

## Protección para cualquier cuenta sin saldo

Además de este escenario, **antes de cualquier tirada real** (escenario 1, serie, «+» y demo), `money.preflight` exige CRÉDITO ≥ APUESTA y saldo de Betsson ≥ APUESTA. Con una cuenta sin saldo, el checker **no tira** y lo deja explicado en el informe («CREDIT 0.00 < BET …»).
