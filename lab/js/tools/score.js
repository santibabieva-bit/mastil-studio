/** Partitura (alphaTab): edita alphaTex o abre Guitar Pro, píntalo y tócalo. */

import { scoreToTab, tabToAlphaTex } from '../core/alphatex.js';
import { tabFromJson, tabToJson } from '../core/tab.js';
import { button, copyText, h, select } from '../ui/dom.js';
import { saveBlob } from '../ui/export.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import { header } from './common.js';

export const TEMPLATES = {
  pentatonic: {
    label: 'Pentatónica de La menor (con dedos)',
    tex: `\\title "Pentatónica de La menor"
\\subtitle "Caja 1"
\\tempo 90
\\instrument 27
\\tuning E4 B3 G3 D3 A2 E2
.
\\ts 4 4
:8 5.6{lf 1} 8.6{lf 4} 5.5{lf 1} 7.5{lf 3} 5.4{lf 1} 7.4{lf 3} 5.3{lf 1} 7.3{lf 3} |
5.2{lf 1} 8.2{lf 4} 5.1{lf 1} 8.1{lf 4} 5.2{lf 1} 8.2{lf 4} 7.3{lf 3} 5.3{lf 1} |
7.4{lf 3} 5.4{lf 1} 7.5{lf 3} 5.5{lf 1} 8.6{lf 4} 5.6{lf 1} r r`,
  },
  techniques: {
    label: 'Riff con técnicas (ligados, slide, bend, vibrato)',
    tex: `\\title "Riff con técnicas"
\\tempo 100
\\instrument 29
\\tuning E4 B3 G3 D3 A2 E2
.
\\ts 4 4
:8 5.3{h} 7.3 5.3{pm} 5.3{pm} 7.3{sl} 9.3 7.3{h} 5.3 |
:4 7.2{b (0 4)} 5.2{v} :2 5.1{v} |
:8 (5.6 7.5) r (5.6 7.5) r (3.6 5.5) (3.6 5.5) x.6 r`,
  },
  arpeggio: {
    label: 'Arpegios Am – F – C – G',
    tex: `\\title "Arpegios Am - F - C - G"
\\tempo 80
\\instrument 24
\\tuning E4 B3 G3 D3 A2 E2
.
\\ts 4 4
:8 0.5 2.4 2.3 1.2 2.3 2.4 0.5 2.4 |
1.6 3.5 3.4 2.3 3.4 3.5 1.6 3.5 |
3.5 2.4 0.3 1.2 0.3 2.4 3.5 2.4 |
3.6 2.5 0.4 0.3 0.4 2.5 3.6 2.5`,
  },
  bass: {
    label: 'Línea de bajo (4 cuerdas)',
    tex: `\\title "Línea de bajo"
\\tempo 110
\\instrument 33
\\tuning G2 D2 A1 E1
.
\\ts 4 4
:8 0.2 0.2 3.3 0.2 5.3 0.2 3.3 0.2 |
0.1 0.1 3.2 0.1 5.2 0.1 3.2 0.1`,
  },
  tripletFeel: {
    label: 'Tresillos (shuffle)',
    tex: `\\title "Shuffle en tresillos"
\\tempo 90
\\instrument 27
\\tuning E4 B3 G3 D3 A2 E2
.
\\ts 4 4
:8 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} |
0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3} 0.5{tu 3} 0.5{tu 3} 2.5{tu 3}`,
  },
};

const SYNTAX = `Cabecera (antes del punto):
  \\title "Nombre"   \\subtitle "…"   \\tempo 100
  \\instrument 27 (guitarra limpia) · 25 acústica · 24 nylon · 29/30 saturada · 33 bajo
  \\tuning E4 B3 G3 D3 A2 E2        (de la cuerda aguda a la grave)
  .                                  (el punto separa la cabecera de la música)

Música:
  \\ts 4 4        compás           |   separa compases
  :8 :16 :4 :2    duración de las notas siguientes (corchea, semicorchea, negra, blanca)
  5.3             traste 5 en la 3.ª cuerda (1 = la más aguda)
  (5.3 7.2)       acorde: varias notas a la vez
  r               silencio          x.3  nota apagada

Efectos (entre llaves, junto a la nota):
  {h} hammer/pull-off hacia la nota siguiente   {sl} slide   {v} vibrato
  {b (0 4)} bend de un tono   {pm} palm mute   {ac} acento   {nh} armónico natural
  {lf 1} dedo de la mano izquierda (1-4)        {tu 3} tresillo`;

function mount(root, ctx) {
  const p = ctx.params;
  let initial = null;
  if (p.handoff) initial = ctx.storage.get('score-handoff', null);
  if (!initial) initial = ctx.storage.get('score-text', null) ?? TEMPLATES.pentatonic.tex;

  const stage = h('div');
  const area = h('textarea', { class: 'at-editor mono', rows: 16, spellcheck: 'false', 'aria-label': 'Código alphaTex' }, initial);
  const info = h('p', { class: 'hint', 'aria-live': 'polite' });
  const score = createScore(stage, {
    onPlaying: (on) => ctx.engine.notePlaying('score', on),
    onLoaded: (sc) => {
      const bars = sc.tracks?.[0]?.staves?.[0]?.bars?.length ?? 0;
      info.textContent = `${sc.title || 'Sin título'} · ${sc.tracks?.length ?? 0} pista(s) · ${bars} compases · ${Math.round(sc.tempo)} bpm`;
    },
  });
  ctx.onCleanup(() => score.destroy());

  let timer = 0;
  const render = () => {
    ctx.storage.set('score-text', area.value);
    score.load(area.value);
  };
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 700);
  });
  ctx.onCleanup(() => clearTimeout(timer));

  const fileInput = h('input', { type: 'file', accept: '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.musicxml,.xml,.mxl,.alphatex,.txt', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (/\.(txt|alphatex)$/i.test(file.name)) {
      area.value = await file.text();
      render();
    } else {
      area.value = `// Archivo abierto: ${file.name} (el texto alphaTex no se genera al abrir un archivo binario)`;
      await score.loadFile(await file.arrayBuffer());
    }
    fileInput.value = '';
  });

  const templates = select(Object.entries(TEMPLATES).map(([value, t]) => ({ value, label: t.label })), 'pentatonic', () => {});
  const toTabCreator = () => {
    const sc = score.state.score;
    const tab = sc ? scoreToTab(sc) : null;
    if (!tab) { ctx.toast('Primero necesito una partitura válida'); return; }
    ctx.storage.set('tab-handoff', tabToJson(tab));
    ctx.go('tab', { handoff: 1 });
  };
  const fromTabCreator = () => {
    const raw = ctx.storage.get('tab-current', null);
    const tab = raw ? tabFromJson(raw) : null;
    if (!tab) { ctx.toast('Aún no hay ninguna tab en el Tab Creator'); return; }
    area.value = tabToAlphaTex(tab);
    render();
  };

  root.append(
    header('Tocar y escribir', 'Partitura (alphaTab)', 'Escribe o pega alphaTex, o abre un archivo de Guitar Pro (.gp, .gp5, .gpx) o MusicXML: se pinta en partitura y tablatura y se puede tocar con el cursor siguiendo la música.'),
    h('div', { class: 'tool-grid' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('h2', {}, 'Código alphaTex'),
          h('div', { class: 'row' },
            templates,
            button('Cargar plantilla', { variant: 'outline', onClick: () => { area.value = TEMPLATES[templates.value].tex; render(); } }),
          ),
          area,
          h('div', { class: 'row' },
            button('Renderizar', { variant: 'accent', onClick: render }),
            button('Copiar', { variant: 'outline', onClick: async () => ctx.toast((await copyText(area.value)) ? 'alphaTex copiado' : 'No se pudo copiar') }),
            button('Guardar .alphatex', { variant: 'outline', onClick: () => saveBlob(new Blob([area.value], { type: 'text/plain' }), 'partitura.alphatex', 'alphaTex') }),
          ),
          h('div', { class: 'row' },
            button('Abrir Guitar Pro / MusicXML…', { variant: 'dark', onClick: () => fileInput.click() }),
            fileInput,
          ),
          info,
        ),
        h('section', { class: 'panel stack' },
          h('h2', {}, 'Tab Creator'),
          h('div', { class: 'row' },
            button('Traer la tab del Tab Creator', { variant: 'outline', onClick: fromTabCreator }),
            button('Enviar esta partitura al Tab Creator', { variant: 'outline', onClick: toTabCreator }),
          ),
          h('p', { class: 'hint' }, 'Al enviarla se convierte en una rejilla editable (columna = una subdivisión).'),
        ),
        h('details', { class: 'syntax' }, h('summary', {}, 'Chuleta de alphaTex'), h('pre', {}, SYNTAX)),
      ),
      h('section', { class: 'panel stack' },
        scoreToolbar(score, { layout: true, extra: [
          button('MIDI', { variant: 'outline', title: 'Descargar como archivo MIDI', onClick: () => score.downloadMidi() }),
          button('Imprimir / PDF', { variant: 'outline', onClick: () => window.print() }),
        ] }),
        stage,
      ),
    ),
  );
  render();
}

export default {
  id: 'score',
  title: 'Partitura (alphaTab)',
  group: 'play',
  icon: '𝄞',
  summary: 'Escribe alphaTex o abre Guitar Pro: se pinta en partitura y tab y se toca con cursor.',
  isNew: true,
  mount,
};

