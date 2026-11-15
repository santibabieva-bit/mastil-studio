/** Capo & Transpose: transpone acordes y encuentra la cejilla con las formas más fáciles. */

import { pcName, prettyNote, mod, parseRoot } from '../core/music.js';
import { capoOptions, parseChordSymbol, preferForKey, transposeSymbol } from '../core/chords.js';
import { coerce } from '../core/state.js';
import { button, clear, copyText, h, segmented, select, slider } from '../ui/dom.js';
import { header, rootChoices } from './common.js';

function mount(root, ctx) {
  const p = ctx.params;
  const state = {
    text: p.chords ?? 'Bb Gm Eb F',
    semis: coerce(p.t, 0),
    prefer: p.pref ?? 'auto',
  };
  const out = h('div', { class: 'stack' });
  const capoOut = h('div', { class: 'stack' });

  const symbols = () => state.text.split(/[\s,;|-]+/).filter(Boolean);

  function transposeBlock() {
    clear(out);
    const list = symbols();
    const first = parseChordSymbol(list[0] ?? '');
    const targetRoot = first ? pcName(mod(first.rootPc + state.semis, 12), state.prefer === 'flat' ? 'flat' : 'sharp') : null;
    const prefer = state.prefer === 'auto' ? (targetRoot ? preferForKey(targetRoot) : 'sharp') : state.prefer;
    const result = list.map((s) => (parseChordSymbol(s) ? transposeSymbol(s, state.semis, prefer) : `?${s}`));
    out.append(
      h('div', { class: 'row' }, ...result.map((r) => h('span', { class: `pill ${r.startsWith('?') ? 'pill--bad' : ''}`, style: 'font-size:1.2rem;padding:8px 16px' }, prettyNote(r)))),
      button('Copiar acordes', { variant: 'outline', onClick: async () => ctx.toast((await copyText(result.join(' '))) ? 'Copiado' : 'No se pudo copiar') }),
    );
  }

  function capoBlock() {
    clear(capoOut);
    const list = symbols().filter((s) => parseChordSymbol(s));
    if (!list.length) {
      capoOut.append(h('p', { class: 'hint' }, 'Escribe acordes arriba.'));
      return;
    }
    const options = capoOptions(list);
    const best = options[0];
    capoOut.append(
      h('div', {}, h('div', { class: 'kicker' }, 'Mejor opción'), h('div', { class: 'big-number', style: 'font-size:2.6rem' }, best.capo === 0 ? 'Sin cejilla' : `Cejilla en el traste ${best.capo}`),
        h('p', { class: 'hint' }, `Tocas: ${best.shapes.map((s) => prettyNote(s.symbol)).join(' · ')} (${best.easy} de ${best.total} son formas abiertas fáciles).`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Cejilla'), h('th', {}, 'Formas que tocas'), h('th', {}, 'Fáciles'))),
        h('tbody', {}, [...options].sort((a, b) => a.capo - b.capo).map((o) => h('tr', { style: o === best ? 'background:var(--orange-pale)' : '' },
          h('td', {}, o.capo === 0 ? 'Sin' : `Traste ${o.capo}`),
          h('td', {}, o.shapes.map((s) => h('span', { class: `pill ${s.easy ? 'pill--ok' : ''}`, style: 'margin-right:4px' }, prettyNote(s.symbol)))),
          h('td', {}, `${o.easy}/${o.total}`),
        ))),
      )),
    );
  }

  function chartBlock() {
    const shapes = ['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm'];
    const rows = Array.from({ length: 8 }, (_, capo) => capo);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cejilla'), ...shapes.map((s) => h('th', {}, `Forma ${s}`)))),
      h('tbody', {}, rows.map((capo) => h('tr', {}, h('td', {}, capo === 0 ? 'Sin' : `Traste ${capo}`), ...shapes.map((s) => h('td', {}, prettyNote(transposeSymbol(s, capo, 'flat').replace(/^Gb/, 'F#'))))))),
    ));
  }

  function renderAll() {
    ctx.setParams({ chords: state.text, t: state.semis, pref: state.prefer });
    transposeBlock();
    capoBlock();
  }

  const input = h('input', { type: 'text', value: state.text, 'aria-label': 'Acordes', placeholder: 'Bb Gm Eb F' });
  input.addEventListener('input', () => { state.text = input.value; renderAll(); });

  const targetSel = select([{ value: '', label: 'Subir/bajar por semitonos…' }, ...rootChoices()], '', (v) => {
    if (!v) return;
    const first = parseChordSymbol(symbols()[0] ?? '');
    if (first) {
      state.semis = mod(parseRoot(v).pc - first.rootPc + 6, 12) - 6;
      semiSlider.setValue(state.semis);
      renderAll();
    }
  });
  const semiSlider = slider({ min: -11, max: 11, value: state.semis, label: 'Semitonos', format: (v) => (v > 0 ? `+${v}` : `${v}`), onInput: (v) => { state.semis = v; renderAll(); } });

  root.append(
    header('Tocar y escribir', 'Capo & Transpose', 'Cambia de tonalidad una progresión o descubre dónde poner la cejilla para tocarla con las formas abiertas más cómodas.'),
    h('section', { class: 'panel stack' }, h('div', { class: 'field' }, h('label', {}, 'Acordes de tu canción (separados por espacios)'), input)),
    h('div', { class: 'grid-2', style: 'align-items:start' },
      h('section', { class: 'panel stack' }, h('h2', {}, 'Transponer'), semiSlider, h('div', { class: 'field' }, h('label', {}, 'O llevar el primer acorde a…'), targetSel),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Ortografía'), segmented([{ value: 'auto', label: 'Automática' }, { value: 'sharp', label: '♯' }, { value: 'flat', label: '♭' }], state.prefer, (v) => { state.prefer = v; renderAll(); })),
        out),
      h('section', { class: 'panel stack' }, h('h2', {}, '¿Dónde pongo la cejilla?'), capoOut),
    ),
    h('section', { class: 'panel stack' }, h('h2', {}, 'Tabla de cejilla'), h('p', { class: 'hint' }, 'Cada fila muestra el acorde que suena al tocar esa forma con la cejilla en ese traste.'), chartBlock()),
  );
  renderAll();
}

export default {
  id: 'capo',
  title: 'Capo & Transpose',
  group: 'play',
  icon: '⇅',
  summary: 'Transpone acordes y encuentra la cejilla con las formas abiertas más fáciles.',
  isNew: true,
  mount,
};
