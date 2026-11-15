# De la plantilla a la biblioteca: app de páginas de entrenamiento

Análisis de qué habría que cambiar en Mástil Studio para generar fichas de
entrenamiento (escalas, arpegios, acordes y tríadas) al estilo de
Discover Guitar Online, propuesta modular y estimación de esfuerzo.

> Referencias: [arpegios](https://discoverguitaronline.com/diagrams/browse/arpeggios) ·
> [escalas](https://discoverguitaronline.com/diagrams/browse/scales) ·
> [acordes y tríadas](https://discoverguitaronline.com/diagrams/browse/chords)

---

## 1. Resumen ejecutivo

- **Se reutiliza entre el 60 % y el 70 % del código**: teoría y enarmonía,
  geometría del mástil, afinación, parser, exportación SVG/PNG, servidor y
  sistema visual. El motor de teoría es el activo más valioso del proyecto.
- **Lo que falta no es «pintar»**. El render actual dibuja *un* mástil dentro de
  un póster de 1520 × 578 con cabecera y pie. Una ficha de entrenamiento es
  *varias* posiciones en una página, cada una en una ventana de 4–6 trastes.
  Eso obliga a partir `svg.js` en dos capas: **mástil** y **lámina**.
- **El trabajo de verdad es el motor de patrones**: hoy hay *una* digitación por
  forma CAGED para escalas, y arpegios/tríadas se pintan como mapa completo de
  15 trastes. Una ficha tipo DGO necesita 5 o 7 posiciones generadas y
  validadas musicalmente. Eso es más de la mitad del esfuerzo.
- **Estimación MVP** (escalas + arpegios + tríadas, 5 posiciones, lámina A4
  imprimible, sitio estático navegable): **106–142 h ≈ 13–18 jornadas** de 8 h.
- **Paridad funcional con DGO** (3 notas por cuerda, 7 patrones, inversiones,
  acordes abiertos y con cejilla, cuatríadas, teoría): **+80–110 h**,
  es decir **23–31 jornadas**.
- **Camino recomendado:** aditivo, no reescritura. El studio actual sigue
  funcionando sobre el mismo core; la app nueva es otra entrada y otra salida.

---

## 2. Inventario: qué tenemos y cuánto sirve

| Módulo | Líneas | Rol actual | Veredicto |
|---|---:|---|---|
| `src/theory.js` | 608 | Notas, intervalos, enarmonía por grado, familias y calidades | **Reutilizar tal cual**. Es la base de la calidad musical del producto |
| `src/parser.js` | 295 | Consultas en lenguaje natural | Reutilizar en el studio. El sitio necesita *slugs*, no texto libre |
| `src/caged.js` | 418 | Afinación, plantillas CAGED, ventanas, `buildFretboard` | Reutilizar `STRINGS`, `OPEN_MIDI` y la geometría de trastes. **Reescribir la lógica de ventanas** (ver 4.5) |
| `src/fingering.js` | 201 | Una digitación ergonómica por forma CAGED | Sirve como *una* variante, no como biblioteca de patrones |
| `src/voicings.js` | 171 | Drop 2 / Drop 3 en posición fundamental | Insuficiente: hace falta búsqueda general por sets de cuerdas e inversiones |
| `src/svg.js` | 738 | SVG autocontenido de una plantilla | **Partir**: el dibujo del mástil se reutiliza; el póster no |
| `src/diagram.js` | 109 | Une teoría + CAGED + voicing + SVG | Convertir en «plan» (datos) + render |
| `src/app.js` | 668 | UI, estado y exportación | Reutilizar el patrón de exportación (File System Access + PNG 2×) |
| `tests/` | 63 pruebas | Red de seguridad real | 1/3 son de píxeles exactos: habrá que reescribirlas al partir el render |

**Lo que no hay que tocar:** enarmonía y ortografía (`theory.js`), parser,
servidor estático, tokens de color y la exportación. Son código estable y ya
probado.

---

## 3. Qué hacen las fichas de DGO que nosotros no

| Pieza | DGO | Nosotros hoy |
|---|---|---|
| Unidad de contenido | Ficha = imagen con **varias posiciones** | Plantilla = **un** mástil |
| Biblioteca | Índice con filtros por tipo y familia | No existe |
| Patrones | «5 patterns», «3 note per string», «7 patterns», 1.ª posición | Una digitación por forma CAGED |
| Arpegios | 5–7 posiciones de 1–2 octavas | Mapa de todos los tonos del acorde en 15 trastes |
| Tríadas y acordes | Tríadas por sets de cuerdas, inversiones, acordes abiertos y con cejilla | Mapa completo o cuatríada Drop 2/3 en fundamental |
| Etiquetas | Puntos, nombres, grados, dedos | Nombre o grado (dos mapas fijos) |
| Soporte | Página HTML + imagen, URLs estables | Una SPA, estado en memoria |
| Impresión | Pensada para imprimir | PNG 2× y SVG sueltos |

La diferencia de fondo: **DGO publica láminas; nosotros publicamos diagramas**.
El cambio es de granularidad del contenido, no de dibujo.

---

## 4. Los seis cambios estructurales

### 4.1 Separar «plan» de «pintado»

Hoy `buildDiagram()` devuelve directamente el string SVG (`src/diagram.js:87`).
Para componer N posiciones en una página eso no sirve: llamar N veces produce N
cabeceras, N pies y N `<style>`.

Propuesta: dos funciones puras.

```js
// 1) Datos: sin SVG, testeable en Node en milisegundos
const plan = planSheet({
  title: 'Escala mayor de A',
  root: 'A', family: 'scale', quality: 'major',
  variant: 'caged5',           // 'caged5' | '3nps' | 'arp5' | 'arps7' | 'open1' | 'inversions'
  labels: 'dots',              // 'dots' | 'name' | 'degree' | 'finger' | 'interval'
  page: { size: 'a4', orientation: 'portrait' },
});
// plan.pages[0].panels = [
//   { id: 'C', caption: 'Forma C · 9–12', window: { start: 9, end: 12 }, notes: [...] },
//   ...
// ]

// 2) Pintado: un único SVG, sin ids duplicados
const svg = renderSheet(plan);
```

Ventaja: la validación musical y los tests se hacen sobre el plan (rápido y
legible), y el pintado se cubre con pocas pruebas de estructura.

### 4.2 Partir `svg.js`: mastil + lámina + tema

Tres responsabilidades hoy mezcladas:

| Responsabilidad | Hoy | Destino |
|---|---|---|
| Geometría (trastes, cuerdas, viewport) | `createLayout`, `CANVAS` (`svg.js:13`, `svg.js:91`) | `render/geometry.js` |
| Dibujo de un mástil (fondo, cuerdas, trastes, marcadores, notas, contorno) | `renderFretboardSvg` (`svg.js:516`) | `render/board.js` → devuelve `<g>` |
| Póster (cabecera, título, leyenda, pie) | `svg.js:748`, `svg.js:786` | `render/sheet.js` |
| Colores y CSS | constante `COLORS` + bloque `<style>` | `render/theme.js` |

**El detalle que muerde:** los `defs` usan ids globales (`paper`, `board`,
`capo`, `board-shadow`, `paper-grain` en `svg.js:676`) y el `<title>` usa ids
fijos (`dsh-title`, `dsh-desc` en `svg.js:674`). Si embebés varios SVG completos
en una misma página HTML, los degradados y el `aria-labelledby` colisionan y
todo apunta al primero.

Solución concreta: **la lámina es un solo SVG**. Los `defs` y el `<style>` se
emiten una vez en la raíz de la página, y cada posición es un grupo (o un
`<svg>` anidado con su propio `viewBox`, que además recorta y aísla
coordenadas). Así no hay colisiones por construcción y la exportación
(PNG/PDF) también es una sola pieza.

### 4.3 Viewport por posición, no 15 trastes fijos

La plantilla actual siempre mide 15 trastes y ocupa 1340 px de ancho. Una ficha
necesita ventanas de 4–6 trastes con una etiqueta «5fr» y, a veces, sin cejilla.
`createLayout` ya sabe calcular posiciones de traste reales, pero el ancho de
panel, el rango visible y la escala por panel no existen.

Además el 15 está incrustado en varios módulos: `findNearestFret` corta en 15
(`caged.js:153`), el filtro de formas (`caged.js:229`), el clamp de ventana
(`caged.js:244`), `completeScaleWindow` (`caged.js:284`), la digitación
(`fingering.js:60`) y el default de `buildFretboard` (`caged.js:440`). El
pendiente 2 de `PENDIENTES.md` lo da por «preparado», pero sólo está preparado
en la firma, no en el flujo.

Trabajo: un objeto `neck` con `{ from, to }` que atraviese todo, más un panel
con `{ width, height, frets }` que escale la geometría existente.

### 4.4 Etiquetas como estrategia, no como dos mapas

Hoy hay exactamente dos modos (`name` y `degree`) con mapas fijos por familia
(`svg.js:282`–`svg.js:330`) y la decisión se toma en `renderNote`
(`svg.js:351`). Una ficha de entrenamiento necesita, como mínimo:

- **puntos** (sin texto): es el formato de la mayoría de las láminas;
- **nombres** (ya está);
- **grados** (ya está);
- **dedos** (1-2-3-4): nuevo, y muy pedido en material didáctico;
- **intervalos** (R, 3, 5, 7, ♭7…): nuevo;
- **quiz**: ocultar selectivamente para practicar.

Es un refactor pequeño y muy rentable: una función
`labelFor(note, mode, collection)` en lugar de dos condicionales.

### 4.5 Motor de patrones: el trabajo real

Esto es lo que separa una demo de una biblioteca. Hoy:

- **Escalas**: 5 ventanas CAGED (`caged.js:281`) y *una* digitación por ventana
  (`fingering.js`), con reglas de 2–3 notas por cuerda.
- **Arpegios y tríadas**: `buildFretboard` pinta **todos** los tonos del acorde
  en los 15 trastes. No hay posiciones.
- **Cuatríadas**: sólo fundamental en el bajo, Drop 2/3 (`voicings.js`).

Y hay un problema de fondo: **nuestro CAGED no es el de las «5 patterns»**.
Nuestras ventanas son idiosincráticas (La mayor: G 1–5, E 4–7, D 6–10, C 9–12,
A 11–15, con A parcial). Las 5 posiciones clásicas son cajas contiguas de 4–6
trastes que cubren el mástil sin huecos ni solapes raros. Para fichas hay que
**generar posiciones con otro criterio**, no reutilizar las ventanas actuales.
No es un bug: son dos modelos distintos y conviene que coexistan.

Generadores necesarios (cada uno devuelve `panels[]` con ventana, notas y
subtítulo):

| Generador | Qué produce | Esfuerzo | Notas |
|---|---|---:|---|
| `caged5` | 5 cajas de escala, una por posición, cubriendo 0–12 | 8–12 h | Validar contra referencia; decide si es CAGED o «pattern 1..5» |
| `arps5` / `arps7` | 5–7 posiciones de arpegio, 1–2 octavas, raíz en 6.ª/5.ª/4.ª… | 10–14 h | El más delicado: digitabilidad y octavas |
| `triads` | tríadas por sets de cuerdas (1-2-3, 2-3-4, …) e inversiones | 8–12 h | Reemplaza el mapa completo para tríadas |
| `threePerString` | 7 posiciones de 3 notas por cuerda, 2 octavas | 8–12 h | Popular en DGO; algoritmo nuevo |
| `open1` | 1.ª posición: acordes abiertos y tríadas | 8–12 h | Gran parte es biblioteca de formas + nombres |
| `voicings` | cuatríadas: inversiones y sets | 8–12 h | Amplía `voicings.js` (pendiente 3 y 4 del repo) |

Regla de oro para no inflar el alcance: **primero 3 generadores** (escalas 5,
arpegios 5, tríadas), que ya dan ~90 % del catálogo útil. 3NPS, 1.ª posición e
inversiones son la fase 2.

### 4.6 Contenido como datos + sitio estático

El catálogo no debería ser HTML a mano. Con «recetas» se generan cientos de
fichas desde pocas definiciones:

```js
// src/content/catalog.js
export const FICHAS = [
  {
    slug: 'escala-mayor-5-posiciones',
    family: 'scale', quality: 'major', variant: 'caged5',
    roots: 'all',                    // o ['C', 'A', 'E', 'G', 'D']
    title: 'Escala mayor: 5 posiciones',
    intro: 'Las cinco cajas que cubren el mástil...',
    tags: ['escalas', 'caged', 'principiante'],
  },
  {
    slug: 'arpegio-dominante-7-5-posiciones',
    family: 'arpeggio', quality: 'dominant7', variant: 'arps5',
    roots: 'all',
    title: 'Arpegio dominante 7: 5 posiciones',
  },
];
```

Un script `scripts/build-site.mjs` (Node puro, sin dependencias) recorre el
catálogo y escribe `site/`:

- una página por ficha, con el SVG **inline** (indexable, imprimible, sin JS);
- un índice con filtros por familia y tipo;
- `sitemap.xml`, `robots.txt`, `404.html`;
- selectores de raíz/variante con JS mínimo y URL compartible.

Ventajas frente a una SPA: URLs estables para SEO y para compartir, carga
instantánea, funciona desde `file://`, y el sitio es reproducible y *diffable*
en git. El studio sigue existiendo para diagramas a medida.

---

## 5. Arquitectura propuesta

Mismo repo, dos entradas, un core:

```text
index.html                  → Studio (lo que ya existe)
src/
  core/
    theory.js               ← mover desde src/, sin cambios
    tuning.js               ← STRINGS y OPEN_MIDI (extraídos de caged.js)
    caged.js                ← formas y ventanas; maxFret parametrizado
    fretboard.js            ← buildFretboard y utilidades MIDI
    patterns/
      index.js              ← registro: variant → generador
      cagedFive.js
      arpPatterns.js
      triads.js
      threePerString.js     ← fase 2
      openPosition.js       ← fase 2
      voicings.js           ← generaliza el actual
  render/
    geometry.js             ← trastes, cuerdas, viewports
    theme.js                ← colores, tipografías, CSS una sola vez
    board.js                ← renderBoard(): un mástil, sin cabecera
    labels.js               ← puntos / nombres / grados / dedos / intervalos
    sheet.js                ← renderSheet(): página A4, grilla, pies
    legacy.js               ← renderFretboardSvg() de compatibilidad
  content/
    catalog.js              ← fichas
    taxonomy.js             ← familias, filtros, textos
  studio/
    app.js                  ← el actual, con imports nuevos
scripts/
  build-site.mjs            ← SSG
  export-samples.mjs        ← el actual
site/                       ← salida generada (no editar a mano)
```

APIs clave:

```js
// render/board.js — un mástil aislado, sin ids globales
renderBoard({
  frets: { from: 5, to: 9 },      // viewport
  notes: [{ stringIndex, fret, label, role }],
  showNut: false,
  fretLabel: '5fr',
  width: 320, height: 190,
  theme,
}) // → '<g>…</g>' o '<svg viewBox…>…</svg>' anidado

// render/sheet.js — la página completa
renderSheet({
  title, subtitle, eyebrow,
  panels: [...],                  // 1, 2, 3, 5 o 6 por página
  page: { size: 'a4', margin: 12 },
  footer: 'Mástil Studio · mastil.studio',
}) // → SVG autónomo

// patterns/index.js — contrato único
generate({ collection, root, neck: { from: 0, to: 15 }, variant, options })
// → { panels: [{ id, caption, window, notes, stringSet }] }
```

Compatibilidad: `renderFretboardSvg` pasa a ser un envoltorio que arma un plan
de un solo panel y lo pinta con el mismo `sheet.js`. El studio no se rompe y
los 63 tests siguen sirviendo de red mientras se migra.

---

## 6. Plan por fases

Supuestos: una persona, 8 h por jornada, sin diseño desde cero (se reutiliza el
sistema visual), tests incluidos, contenido semilla incluido.

| Fase | Trabajo | Horas | Jornadas |
|---|---|---:|---:|
| 0 | Reordenar módulos (`core`/`render`/`studio`), scripts npm, imports, tests verdes | 6–8 | 1 |
| 1 | Partir el render: geometría, `board`, `theme`, `sheet`, wrapper de compatibilidad, reescritura de tests de SVG | 24–32 | 3–4 |
| 2 | Motor de patrones MVP: `caged5`, `arps5`, `triads` + validaciones | 24–32 | 3–4 |
| 3 | Láminas A4 (1/2/3/5 paneles), leyendas, «5fr», impresión y PNG de lámina | 14–18 | 2 |
| 4 | Catálogo, taxonomía, SSG, índice con filtros, páginas de detalle, sitemap | 22–28 | 3–3,5 |
| 5 | QA visual y musical, contenido semilla (~40 fichas), accesibilidad, responsive | 16–24 | 2–3 |
| | **Total MVP** | **106–142** | **13–18** |

Ruta crítica: **1 → 2 → 3 → 4**. La fase 5 puede solaparse con la 4.

Ampliaciones (escenario de paridad):

| Extra | Horas |
|---|---:|
| `threePerString` (7 posiciones) | 10–12 |
| Arpegios de 7 patrones y 2 octavas | 8–10 |
| Tríadas: inversiones y sets completos | 10–12 |
| Acordes abiertos y con cejilla (1.ª posición) | 10–14 |
| Cuatríadas: inversiones y más voicings | 10–12 |
| Fichas de teoría y técnica (texto + diagramas) | 8–12 |
| Contenido y QA de las 12 raíces | 24–32 |
| **Subtotal** | **80–104** |

---

## 7. Escenarios y calendario

| Escenario | Alcance | Horas | Jornadas |
|---|---|---:|---:|
| **A. MVP** | Escalas, arpegios y tríadas; 5 posiciones; A4 imprimible; sitio con índice y ~40 fichas | 106–142 | 13–18 |
| **B. Paridad DGO** | A + 3NPS, 7 patrones, inversiones, acordes abiertos/cejilla, cuatríadas, teoría | 186–246 | 23–31 |
| **C. Entrenamiento interactivo** | A + quiz, progreso local, audio/metrónomo, modo práctica | 146–202 | 18–25 |

Si se trabaja a media jornada, multiplicar por ~1,8. La estimación es más firme
en código (fases 0–4) y más elástica en contenido y QA musical, que es donde
suele aparecer el sobrecoste.

**Reparto aproximado del MVP:** ~70 % código, ~30 % contenido, validación
musical y pulido visual.

---

## 8. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Los patrones generados no coinciden con lo que se espera (CAGED vs «5 patterns») | Alta | Alto | Definir el modelo de posiciones antes de programar; validar 2–3 fichas contra referencia y contra oído |
| La auditoría de digitaciones pendiente se multiplica por variante | Alta | Alto | Empezar con 3 generadores; tests de invariantes (sin cuerdas vacías, span máximo, notas dentro de ventana) |
| Los tests actuales son de píxeles exactos y frenan el refactor | Media | Medio | Reescribir por estructura + snapshots; no tocar los tests de teoría |
| Multiplicar 12 raíces × familias dispara el QA | Media | Medio | Páginas canónicas sin raíz + selector; raíces curadas para SEO |
| Ids y estilos duplicados al componer SVG | Baja | Alto | Una sola lámina SVG con `defs` únicos; `<svg>` anidados por panel |
| Impresión/PDF con márgenes impredecibles | Baja | Bajo | CSS `@page` y prueba en Chrome/Edge; PDF vía diálogo del navegador |
| Alcance: ganas de hacer «todo DGO» de una | Media | Alto | Congelar el MVP en 3 familias y 5 posiciones; el resto, fase 2 |

---

## 9. Ideas que suman (y que DGO no tiene)

1. **Modo entrenamiento de verdad.** Ocultar nombres, preguntar «¿qué grado es
   esta nota?», marcar posiciones practicadas y guardar progreso en
   `localStorage`. Es barato sobre la capa de render y convierte una biblioteca
   de imágenes en una app.
2. **Ficha imprimible A4 + QR** a la versión interactiva. Muy útil para
   profesores y academias.
3. **URL como estado.** `?family=arpeggio&quality=dominant7&root=G&shape=E&labels=degree`
   para compartir exactamente lo que estás viendo, sin backend.
4. **Contact sheet de auditoría.** Un script que renderice todas las
   combinaciones en una grilla PNG para revisar digitaciones de un vistazo.
   Ahorra horas de QA manual.
5. **Cuaderno multi-página.** Un PDF con 5 fichas = una clase. Reutiliza la
   misma lámina con paginación.
6. **Fichas de tonalidad.** «Acordes de La mayor»: los 7 acordes diatónicos,
   que ya se pueden derivar de `theory.js`.
7. **Selector de raíz y variante en la ficha.** SSG para el contenido, JS mínimo
   para cambiar de raíz sin recargar.
8. **Audio/metrónomo** con WebAudio, sin dependencias, más adelante.

Nota: la propuesta es generar nuestros propios patrones. Copiar las imágenes de
referencia no aporta y complica el proyecto; el valor está en el motor.

---

## 10. Decisiones antes de empezar

1. **¿App separada o dentro del studio?** Recomendación: mismo repo, dos
   entradas (`/` studio, `/sitio` biblioteca), core compartido. Evita duplicar
   teoría y render.
2. **¿Las fichas llevan raíz fija o selector?** Recomendación: página canónica
   sin raíz (patrón movible) + selector, y unas pocas raíces curadas para SEO.
3. **¿Fidelidad a DGO o criterio propio?** Recomendación: mismo *concepto* de
   ficha, patrones propios validados musicalmente. Nuestro CAGED no es el suyo.
4. **¿Impresión primero o interacción primero?** Recomendación: impresión y SVG
   primero (es lo que valida el render por paneles); quiz después.
5. **¿Qué familias entran en el MVP?** Recomendación: escalas, arpegios y
   tríadas. Cuatríadas e inversiones, fase 2.

---

## 11. Primer paso recomendado (2–3 jornadas)

Una tajada vertical que desriesga el 70 % de las incógnitas:

1. Extraer `render/board.js` y `render/sheet.js` del `svg.js` actual, dejando
   `renderFretboardSvg` como envoltorio y los tests en verde.
2. Escribir `patterns/cagedFive.js` para **una** colección (La mayor).
3. Generar una lámina A4 con las 5 posiciones, cabecera, pies y numeración.
4. Imprimir a PDF desde el navegador y mirarla en papel.

Criterio de aceptación: una página A4 con 5 mástiles legibles, sin ids
duplicados, imprimible, y el studio actual funcionando igual que antes. Si eso
sale bien, el resto es repetir el patrón para más familias y variantes.
