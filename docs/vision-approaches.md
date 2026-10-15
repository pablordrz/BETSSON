# Enfoques de visión — qué usamos, por qué y con qué datos

El checker «ve como un jugador»: nunca lee el DOM del juego (es un canvas en un iframe de Pragmatic Play), solo **píxeles**. Hay cuatro problemas de visión distintos, y para cada uno hemos elegido la técnica **midiéndola sobre fotogramas reales** del juego (Triple Hop Pots, betsson.es).

Todos los números de este documento salen de la última ejecución (los tiempos varían unos ms entre ejecuciones):

```bash
node scripts/bench-vision.cjs        # offline, sin navegador ni dinero (≈ 1 min)
```

Lo que garantizan las mediciones lo comprueban tests automáticos en `npm run unit` (`tests/unit/vision-approaches.spec.ts`).

## Conclusiones

1. **No hay una técnica mejor para todo: cada problema tiene la suya**, elegida por datos y no por moda.
   - Para **encontrar botones**, comparar la imagen con el icono (plantilla) y buscar círculos (Hough).
   - Para **leer números**, OCR.
   - Para **saber si algo se mueve**, diferencia de fotogramas.
2. **Botón de tirar: combinar dos técnicas supera a cada una por separado.**
   - La **plantilla** es la más fiable (9/9, error 0,08 radios), pero lenta la primera vez: 2,7 s.
   - **Hough** es igual de fiable (9/9, 0 falsos positivos) y 55× más rápido (48 ms), pero no sabe si es *el* icono de Pragmatic.
   - **Juntas** (Hough dice dónde y la plantilla confirma): **9/9, 0 falsos positivos y 0,4 s.**
3. **La segmentación no compensa aquí.** Es la más precisa cuando acierta (0,02 radios), pero solo acierta 3/9: el botón se funde con el dibujo oscuro que tiene detrás.
4. **Lo que más importa no es acertar, sino no equivocarse.** Un falso positivo es un clic donde no hay botón. Todas las técnicas que usamos tienen **0 falsos positivos**, y además **el clic nunca es la prueba**: la pantalla tiene que mostrar que la tirada empezó.
5. **Leer el saldo: el preprocesado importa más que el motor de OCR.** El mismo Tesseract pasa de **0/2 a 2/2 lecturas correctas** solo con quedarse con el texto brillante (umbral 210), y además es más rápido (hasta 3,9×: 848 → 215 ms).
6. **Para el movimiento basta lo simple**: la diferencia de fotogramas separa «nada pasa» (≤ 0,02) de «algo cambió» (0,25) con un margen de más de 10×.
7. **La IA entrenada (YOLO, modelos de visión-lenguaje) no hace falta para este alcance.** Para los botones de Pragmatic, la visión clásica ya da 9/9 sin entrenar nada y en milisegundos. Quedan como **ampliación** para juegos de otros proveedores: cada una entraría como un detector más en la cascada (`ScreenTarget`), sin tocar los escenarios.

## Gráficas

Generadas con matplotlib a partir de los resultados medidos (`docs/vision-approaches/results.json`). Para regenerarlas: `node scripts/bench-vision.cjs`.

**Botón de tirar: fiabilidad frente a velocidad.** La zona verde es lo ideal: fiable y rápido.

![Fiabilidad frente a velocidad](vision-approaches/01-fiabilidad-vs-velocidad.png)

**Botón de tirar: resultado en cada caso.** Cada fila es una técnica y cada columna un fotograma (3 reales × 3 tamaños, y 3 sin botón). El número es el error en radios del botón.

![Mapa de casos](vision-approaches/04-mapa-de-casos.png)

**Botón de tirar: aciertos y tiempo de la primera búsqueda**

![Aciertos](vision-approaches/02-aciertos.png)

![Tiempo](vision-approaches/03-tiempo.png)

**Leer CRÉDITO y APUESTA: el preprocesado decide.** Solo el binarizado ≥ 210 lee bien las dos franjas, y es el más rápido.

![OCR del HUD](vision-approaches/05-ocr-hud.png)

**Saber si los rodillos se mueven.** El margen entre el ruido y un cambio real deja sitio de sobra para el umbral.

![Movimiento](vision-approaches/06-movimiento.png)

## Resumen

| Problema | Técnica elegida | Por qué (dato medido) |
|---|---|---|
| **Encontrar el botón de tirar** | Cascada: **plantilla ZNCC guiada por Hough → Hough de círculos** → tecla ESPACIO → posición calibrada | Plantilla: 9/9, error 0,08 radios. Hough: 9/9, **0 falsos positivos, 56 ms** y sin plantilla. Juntas: 9/9 y la primera búsqueda pasa de 2,7 s a **0,4 s** |
| **Leer CRÉDITO / APUESTA** | **OCR (Tesseract) con binarización del texto brillante (≥ 210)** | La única variante correcta en las dos franjas del HUD; el OCR normal falla en ambas |
| **Saber si los rodillos se mueven** | **Diferencia de fotogramas** con umbral sobre el ruido en reposo | Reposo y temblor ≤ 0,02 frente a 0,25 en un cambio real: margen de 10× |
| **Mensaje de saldo insuficiente** | OCR + expresiones regulares por intención y por idioma | Pendiente de fotogramas reales (ver «Siguientes pasos») |

---

## 1. El botón de tirar

### Qué tiene de difícil

- En la **intro**, el botón es un **disco negro** con flechas blancas. En el **juego**, el mismo botón es un **disco verde azulado oscuro**: cambia el color de fondo.
- Su tamaño depende de la ventana y del juego.
- Hay **otros botones redondos con icono** (−, +, info, menú) que tienen la misma forma.
- Un **falso positivo es caro**: un clic en otro sitio puede abrir un menú o cambiar la apuesta.

### Banco de pruebas

- **9 casos positivos**: 3 fotogramas reales × 3 escalas (×0,7, ×1, ×1,3):
  - `vision/intro-triple-hop-pots.png`: intro, 1212×683;
  - `pragmatic-triple-hop-pots.png`: juego listo, 1212×683;
  - `vision/intro-triple-hop-pots-1273.png`: intro en otra ventana, 1273×697.
- **3 casos negativos**, donde no debe encontrar nada:
  - el juego con el botón tapado (los demás botones redondos siguen ahí);
  - solo la parte superior de la intro;
  - solo el decorado lateral.
- **Verdad de referencia:** el centro y el radio de cada botón se midieron a partir de sus píxeles. Cuenta como **acierto** si el centro detectado cae a menos de **0,6 radios** del real (el clic cae dentro del botón).

### Resultados

| Técnica | Aciertos | Falsos positivos | Error medio | Mediana | Máximo | Necesita |
|---|---|---|---|---|---|---|
| **Plantilla ZNCC** (`template.ts`, `TemplateTarget`) | **9/9** | **0/3** | 0,08 radios | 2 663 ms¹ | 5 491 ms¹ | el icono recortado (`assets/templates/pragmatic/spin.png`) |
| **Plantilla guiada por Hough** (la que usamos) | **9/9** | **0/3** | 0,08 radios | **399 ms**² | 796 ms² | el icono + Hough |
| **Hough de círculos** (`hough-target.ts`) | **9/9** | **0/3** | 0,10 radios | **48 ms** | 69 ms | nada: cualquier botón redondo grande con icono |
| **Segmentación** (`segmentation-target.ts`) | 3/9 | **0/3** | **0,02 radios** | 46 ms | 72 ms | nada |

² Solo en los casos con botón. Cuando no hay botón, Hough no da pista y la plantilla hace su búsqueda completa (1,7–6,5 s). Lo dejamos así a propósito: si Hough fallase en otro juego, la plantilla todavía lo encuentra sola.

¹ Es la **primera búsqueda**, en todo el fotograma y a todos los tamaños. Una vez encontrado, la plantilla vuelve a mirar **solo donde estaba y a su tamaño** (camino rápido en `TemplateTarget.locate`), y eso tarda milisegundos. Por eso el coste solo se paga una vez por partida.

### Cómo funciona cada una y qué aprendimos

**Plantilla ZNCC** (correlación cruzada normalizada con media cero)
- Desliza el icono recortado por la imagen, a varios tamaños, y mide el parecido de −1 a 1.
- No le afectan el brillo ni el contraste, y las zonas lisas dan 0.
- Una máscara circular hace que solo compare el interior del botón, así funciona con el disco negro **y** con el verde azulado.
- **A favor:** la más fiable y explicable («este es el icono de Pragmatic»).
- **En contra:** lenta en la primera búsqueda, y necesita una plantilla por diseño de botón.

**Hough de círculos** (nuevo)
1. Bordes con Sobel. Cada borde fuerte vota por los posibles centros en la dirección de su gradiente, para todos los radios del rango.
2. Los círculos con más apoyo se **verifican como botón**: un disco **más oscuro que su entorno**, comparando el percentil 30 del interior con la mediana del anillo exterior, con **trazos claros dentro** (el icono). Las monedas, burbujas y pétalos son claros por dentro y no pasan.
3. Entre los botones verificados se elige **el más grande** (radio ≥ 1,8 % del ancho). Es la regla que separa el botón de tirar (~2,5–3 % del ancho) de −, +, info y menú (~1–1,3 %).

Así llegamos al 9/9 sin falsos positivos, en tres iteraciones que dejamos documentadas porque explican por qué funciona:

| Iteración | Resultado | Problema → arreglo |
|---|---|---|
| 1 | 0/9 | La verificación comparaba **medias**: las flechas blancas subían la media del disco y parecía «no oscuro». Arreglo: comparar el **fondo** del disco (percentil 30) |
| 2 | 4/9, 1 falso positivo | Elegía **otro botón redondo** (−, +, menú: misma forma). Arreglo: **regla de tamaño**, el botón de tirar es el más grande |
| 3 | 9/9, 0 falsos positivos | Solo guardaba el radio más votado por centro. Ese suele ser **el círculo de las flechas** (interior), que tapaba al borde del disco. Arreglo: considerar todos los radios con apoyo y descartar solo duplicados de mismo centro **y** mismo radio |

- **A favor:** sin plantilla, rápida, generaliza a botones redondos que nunca ha visto.
- **En contra:** depende de la regla «el botón de tirar es el más grande y redondo». Es cierta en Pragmatic y en la mayoría de slots, pero no en todos.

**Segmentación** (nueva)
- Umbral adaptativo («más oscuro que su vecindario»), componentes conexas y filtro por forma (caja cuadrada, relleno de disco) y aspecto (la misma verificación de botón).
- Es **la más precisa** cuando acierta (0,02 radios) y nunca da falsos positivos.
- Pero solo acierta 3/9: en la intro, **el disco negro toca los contornos oscuros de la rana** y se fusionan en una sola región de 119×108 px en lugar de un círculo de radio 12.
- Probamos a separarlos con **erosión morfológica**, y empeora a 0/9 con un falso positivo: las flechas dejan el disco como un anillo fino que la erosión también rompe. Queda desactivada (`erode: 0`).
- **Conclusión:** buena para botones sobre fondos limpios; frágil cuando el botón toca otro dibujo oscuro. **No entra en la cascada.**

### Decisión

```
spin: plantilla ZNCC (guiada por Hough)  →  Hough de círculos  →  ESPACIO  →  posición calibrada
```

**Plantilla guiada por Hough** (`TemplateTarget` con la opción `seed`): en la primera búsqueda, Hough dice **dónde** hay un botón redondo y **qué tamaño** tiene, en ~50 ms. Después la plantilla solo confirma que **es** el icono de Pragmatic, en esa zona y a unos pocos tamaños alrededor del que dio Hough. Se queda la fiabilidad de la plantilla (9/9, error 0,08) y la primera búsqueda pasa de **2,7 s a 0,4 s de mediana**. Si la plantilla no confirma, hace su búsqueda completa como antes.

- La **plantilla va primero**: es la prueba más fuerte de que es *el* botón de Pragmatic, y tras la primera búsqueda vuelve a comprobarlo en milisegundos.
- **Hough va segundo**: cubre los juegos o estados donde el icono cambia (otros diseños, el botón en estado «parar»…) con el mismo acierto y sin plantilla.
- El clic **nunca es la prueba**: después de cada acción, la pantalla tiene que mostrar que la tirada empezó (rodillos en movimiento o crédito que cambia). Si no, se prueba la siguiente opción **sin tirar dos veces**.

`GameControls.spinButton` (comprobar que el botón vuelve a estar disponible al final de la tirada) y `continueButton` (pasar la intro) usan la misma pareja plantilla → Hough.

Código: `src/vision/controls/{hough-target,segmentation-target,raster}.ts` y `game-controls.ts`.

---

## 2. Leer CRÉDITO y APUESTA (HUD)

Verdad: **CRÉDITO 99,90 € · APUESTA 2,00 €** (`pragmatic-triple-hop-pots.png`).

| Franja del HUD | Preprocesado | CRÉDITO | APUESTA | ¿Correcto? | ms |
|---|---|---|---|---|---|
| 20 % inferior | normal (contraste + invertir) | — | — | **no** | 848 |
| 20 % inferior | binarizado ≥ 180 | 99,9 | 2 | sí | 342 |
| 20 % inferior | **binarizado ≥ 210** | 99,9 | 2 | **sí** | 215 |
| 10 % inferior | normal | 99,9 | 0 | **no** | 259 |
| 10 % inferior | binarizado ≥ 180 | 99 | 2 | **no** | 231 |
| 10 % inferior | **binarizado ≥ 210** | 99,9 | 2 | **sí** | 130 |

**Por qué:** el texto del HUD de Pragmatic (etiquetas amarillas, importes blancos) es **más brillante que cualquier fondo del juego**. Quedarse solo con los píxeles ≥ 210 deja el texto negro sobre blanco y borra el decorado. El OCR normal confunde el decorado con letras.

**Decisión:** primero binarizado ≥ 210 y, si no lee CRÉDITO y APUESTA, el modo normal como respaldo (`readHud` en `src/vision/hud.ts`). Además, con dinero de por medio **nunca nos fiamos de una sola lectura**: hay que leer dos veces seguidas el mismo valor (`readHudStable`).

**Alternativas descartadas para leer números:**
- *Modelos de visión-lenguaje*: leen bien, pero son lentos (1–3 s), de pago, no deterministas y dependen de la red. Para un número que leemos decenas de veces por partida, no compensa.
- *Plantillas de dígitos*: más rápidas, pero dependen de la fuente de cada juego.

---

## 3. Saber si los rodillos se mueven

Diferencia de fotogramas: fracción de píxeles que cambian (`pixelmatch`, `src/vision/motion.ts`).

| Par de fotogramas | Cambio |
|---|---|
| mismo fotograma | 0,000 |
| recomprimido (ruido de compresión) | 0,000 |
| temblor de 1–2 px | 0,021 |
| **intro → juego (cambio real)** | **0,249** |

**Por qué:** es barato (ms), no necesita saber nada del juego y hay un margen de **más de 10×** entre «nada pasa» y «algo cambió de verdad». Como los slots tienen animaciones en reposo, el umbral no es fijo: antes de tirar se **mide el ruido en reposo** y se exige superar 3× ese ruido (paso `game.idleNoise`).

**Alternativa descartada:** *flujo óptico*. Da dirección y velocidad, que no necesitamos para decidir «empezó / terminó», y cuesta mucho más.

---

## 4. Mensaje de saldo insuficiente

- **Técnica:** OCR de todo el fotograma + expresiones regulares por **intención**, no texto exacto (`src/config/game-text.ts`: `INSUFICIENTE|NO TIENE SALDO|SIN FONDOS|…`).
- Detecta también si el mensaje está **en otro idioma** (lo marca como fallo de idioma) y si lo muestra la web de Betsson en vez del juego.
- **Pendiente:** aún no tenemos un fotograma real del mensaje con una cuenta a 0 €. Ver «Siguientes pasos».

---

## Enfoques evaluados y no implementados

| Enfoque | Para qué serviría | Por qué no ahora |
|---|---|---|
| **YOLO / SSD** (detector entrenado) | Botones de cualquier proveedor y diseño | Habría que etiquetar cientos de capturas y entrenar; añade ONNX Runtime. Para los botones de Pragmatic, plantilla + Hough ya dan 9/9 |
| **Modelo de visión-lenguaje** (Claude, GPT-4o) | «¿Dónde está el botón de tirar?» en un juego desconocido | 1–3 s y coste por llamada, no determinista, depende de la red. Encaja como **último recurso** detrás de una variable de entorno: sería otro `ScreenTarget` en la cascada, sin tocar los escenarios |
| **Puntos clave ORB / SIFT** | Iconos rotados o tapados en parte | Los iconos pequeños y simples dan muy pocos puntos clave; además requiere OpenCV |
| **Probar posiciones y mirar si gira** | Encontrar el botón sin reconocerlo | **Descartado con dinero real**: cada intento puede ser una tirada |

Todas encajan en la misma interfaz (`ScreenTarget.locate(frame)`), así que añadir una es **un archivo nuevo y una línea en la cascada**.

---

## Siguientes pasos (peticiones a D, que ejecuta en vivo)

Fotogramas reales, sin datos personales, en `tests/unit/fixtures/demo/`:
1. **Rodillos girando** y **botón en estado «parar»**: medir si plantilla y Hough reconocen el botón durante la tirada.
2. **Pantalla de premio**: comprobar que la lectura de GANANCIA y la detección del final de tirada aguantan las animaciones de premio.
3. **Mensaje de saldo insuficiente** (cuenta a 0 €): medir el OCR del mensaje y ajustar la expresión (archivo congelado: PR acordado).
4. **Otro juego de Pragmatic**: comprobar que Hough generaliza sin plantilla nueva.

Con cada fotograma nuevo basta con añadirlo a `CASES` en `tests/unit/vision-approaches.spec.ts` y ejecutar `node scripts/bench-vision.cjs`.
