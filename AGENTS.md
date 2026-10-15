# Instrucciones para asistentes de IA (leer ANTES de tocar nada)

Este repo lo trabajan **4 personas en paralelo (A, B, C, D)**, cada una con su asistente de IA. Para no pisarse, cada persona solo puede editar sus archivos.

## Antes de cualquier cambio

1. **Averigua qué persona es el usuario: A, B, C o D.**
   - Si el usuario ya lo ha dicho (p. ej. «soy B»), úsalo.
   - Si no, **pregúntaselo** antes de editar nada. No lo deduzcas por el nombre.
2. **Lee estos dos archivos completos y síguelos:**
   - `docs/ai-briefs/_COMMON.md`: contexto, reglas, flujo de git y escenarios;
   - el brief de esa persona: `docs/ai-briefs/A-narrativa.md`, `B-vision.md`, `C-reports.md` o `D-demo.md`.
3. **Solo edita los archivos de la sección «PUEDES TOCAR» de ese brief.** Si hace falta cambiar algo de otra persona o algo congelado, **no lo hagas**: díselo al usuario para que lo pida al dueño en un PR aparte.
4. Trabaja en la rama del brief (nunca directamente en `main`).

## Antes de dar el trabajo por terminado o abrir un PR

```bash
node scripts/check-ownership.cjs <A|B|C|D>   # debe decir OK
npx tsc --noEmit                             # 0 errores
npm run unit                                 # todo en verde
```

Si `check-ownership` falla, deshaz los cambios en archivos ajenos (`git checkout origin/main -- <archivo>`).

## Reglas que nunca se saltan

- **Sin secretos**: nada de credenciales, cabeceras `x-obg-*`, `.env` ni `.auth/` en el código, los docs, las capturas o los commits.
- **Dinero real**: solo la persona **D** ejecuta pruebas que tiran (`npm test`, `npm run spins`, `npm run demo`, `npm run all`). La persona **A** solo ejecuta en vivo pruebas que **nunca tiran** (`npm run balance`, el escenario 2 con la cuenta sin saldo). Nunca ejecutes en vivo sin que el usuario lo pida.
- **Juego responsable**: no cambies cómo se tratan el aviso ni los límites de la sesión de juego.
- **Contratos congelados**: no cambies las firmas de `src/steps/**` ni los escenarios de `tests/scenarios/**`.

Resumen del reparto: `docs/WORK-SPLIT.md`.
