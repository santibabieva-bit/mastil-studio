/** Referencia: escalas en las 12 tonalidades, acordes por tonalidad, afinaciones y círculo de quintas. */

import {
  TUNINGS, FAMILY_DEFS, createNoteCollection, midiName, prettyNote,
} from '../core/music.js';
import { diatonicChords } from '../core/chords.js';
import { h, segmented, select } from '../ui/dom.js';
import { header, qualityChoices } from './common.js';

const ORDER_FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

function mount(root, ctx) {
  const st = { tab: ctx.params.tab ?? 'scales', quality: ctx.params.q ?? 'major', mode: 'major', seventh: false };
  const body = h('div', { class: 'stack' });

  function scales() {
    const def = FAMILY_DEFS.scale.qualities[st.quality] ?? FAMILY_DEFS.scale.qualities.major;
    const collections = ORDER_FIFTHS.map((root) => createNoteCollection(root, 'scale', def.id));
    const cols = Math.max(...collections.map((c) => c.notes.length));
    const rows = ORDER_FIFTHS.map((root, i) => h('tr', {},
      h('td', {}, h('strong', {}, prettyNote(root))),
      collections[i].notes.map((n) => h('td', {}, n.name)),
      h('td', {}, h('a', { href: `#/navigator?root=${encodeURIComponent(root)}&fam=scale&q=${def.id}` }, 'Ver en el mástil')),
    ));
    return h('section', { class: 'panel stack' },
      h('div', { class: 'row' }, select(qualityChoices('scale'), def.id, (v) => { st.quality = v; draw(); }, { 'aria-label': 'Escala', style: 'max-width:240px' })),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Tónica'), Array.from({ length: cols }, (_, i) => h('th', {}, `${i + 1}`)), h('th', {}, ''))),
        h('tbody', {}, rows),
      )),
      h('p', { class: 'hint' }, `Fórmula de intervalos (semitonos desde la tónica): ${def.intervals.join(' – ')}.`),
    );
  }

  function chordsByKey() {
    const rows = ORDER_FIFTHS.map((root) => {
      const list = diatonicChords(root, st.mode, st.seventh);
      return h('tr', {}, h('td', {}, h('strong', {}, prettyNote(root))), list.map((c) => h('td', {}, prettyNote(c.symbol))));
    });
    const head = diatonicChords('C', st.mode, st.seventh);
    return h('section', { class: 'panel stack' },
      h('div', { class: 'row' },
        segmented([{ value: 'major', label: 'Mayor' }, { value: 'naturalMinor', label: 'Menor natural' }, { value: 'harmonicMinor', label: 'Menor armónica' }], st.mode, (v) => { st.mode = v; draw(); }),
        segmented([{ value: 'triad', label: 'Tríadas' }, { value: 'seventh', label: 'Séptimas' }], st.seventh ? 'seventh' : 'triad', (v) => { st.seventh = v === 'seventh'; draw(); }),
      ),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Tonalidad'), head.map((c) => h('th', {}, c.roman)))),
        h('tbody', {}, rows),
      )),
      h('p', { class: 'hint' }, 'Las tonalidades están ordenadas por el círculo de quintas.'),
    );
  }

  function tunings() {
    return h('section', { class: 'panel' }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Afinación'), h('th', {}, 'Cuerdas (grave → aguda)'))),
      h('tbody', {}, Object.values(TUNINGS).map((t) => h('tr', {}, h('td', {}, t.label), h('td', { class: 'mono' }, [...t.midi].reverse().map((m) => prettyNote(midiName(m))).join('  '))))),
    )));
  }

  function circle() {
    const cx = 160;
    const cy = 160;
    const r = 120;
    const items = ORDER_FIFTHS.map((root, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const minor = createNoteCollection(root, 'scale', 'major').notes[5].name;
      return `<text x="${cx + Math.cos(a) * r}" y="${cy + Math.sin(a) * r + 6}" text-anchor="middle" font-size="20" font-weight="700" fill="#17231e">${prettyNote(root)}</text>`
        + `<text x="${cx + Math.cos(a) * (r - 44)}" y="${cy + Math.sin(a) * (r - 44) + 5}" text-anchor="middle" font-size="14" fill="#b65d18">${prettyNote(minor)}m</text>`;
    });
    return h('section', { class: 'panel stack' },
      h('div', { html: `<svg viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Círculo de quintas" style="max-width:100%;height:auto"><circle cx="${cx}" cy="${cy}" r="${r + 22}" fill="#fffdf8" stroke="#ddd2bf"/><circle cx="${cx}" cy="${cy}" r="${r - 62}" fill="none" stroke="#ddd2bf"/>${items.join('')}</svg>` }),
      h('p', { class: 'hint' }, 'Exterior: tonalidades mayores. Interior: su relativa menor. Cada paso a la derecha añade un sostenido; a la izquierda, un bemol.'),
    );
  }

  const views = { scales, chords: chordsByKey, tunings, circle };
  function draw() {
    body.replaceChildren(views[st.tab]());
    ctx.setParams({ tab: st.tab, q: st.quality });
  }

  root.append(
    header('Referencia', 'Referencias rápidas', 'Escalas en las 12 tonalidades, acordes de cada tonalidad, afinaciones habituales y círculo de quintas, para consultar sin salir del estudio.'),
    segmented([{ value: 'scales', label: 'Escalas' }, { value: 'chords', label: 'Acordes por tonalidad' }, { value: 'tunings', label: 'Afinaciones' }, { value: 'circle', label: 'Círculo de quintas' }], st.tab, (v) => { st.tab = v; draw(); }),
    body,
  );
  draw();
}

export default {
  id: 'reference',
  title: 'Referencias rápidas',
  group: 'ref',
  icon: '☰',
  summary: 'Escalas en las 12 tonalidades, acordes por tonalidad, afinaciones y círculo de quintas.',
  mount,
};
