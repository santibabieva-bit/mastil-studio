/** Chord & Key Finder: nombra acordes, lista los de una tonalidad y encuentra la tonalidad de una canción. */

import {
  TUNINGS, midiName, pcName, prettyNote, mod,
} from '../core/music.js';
import {
  CHORD_TYPES, bestShape, chordNoteNames, chordShapes, detectChords, diatonicChords, findKeys, parseChordSymbol, shapeMidis,
} from '../core/chords.js';
import { renderChordBox } from '../ui/chordbox.js';
import { button, clear, h, select, toggle } from '../ui/dom.js';
import { guitarMidis } from '../audio/backing.js';
import { header, rootChoices } from './common.js';

const MODE_CHOICES = [
  { value: 'major', label: 'Mayor' },
  { value: 'naturalMinor', label: 'Menor natural' },
  { value: 'harmonicMinor', label: 'Menor armónica' },
  { value: 'melodicMinor', label: 'Menor melódica' },
  { value: 'dorian', label: 'Dórica' },
  { value: 'phrygian', label: 'Frigia' },
  { value: 'lydian', label: 'Lidia' },
  { value: 'mixolydian', label: 'Mixolidia' },
  { value: 'locrian', label: 'Locria' },
];

const STD_LOW_TO_HIGH = TUNINGS.standard.midi.slice().reverse(); // 6ª → 1ª

function chordCard(engine, chord, extra = {}) {
  const shape = bestShape(chord.rootPc, chord.typeId);
  const card = h(
    'button',
    { type: 'button', class: 'chord-card', title: 'Pulsa para oír el acorde' },
    extra.roman ? h('div', { class: 'roman' }, extra.roman) : null,
    h('div', { html: renderChordBox({ frets: shape.frets, title: chord.symbol, size: 1 }) }),
    h('div', { class: 'chord-notes' }, (extra.notes ?? chordNoteNames(chord.rootName, chord.typeId)).join(' · ')),
  );
  card.addEventListener('click', async () => {
    await engine.ensure();
    engine.strum(shapeMidis(shape.frets), engine.time + 0.02, { vel: 0.75, dur: 2 });
  });
  return card;
}

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const state = {
    root: p.root ?? ctx.session.get().root,
    mode: p.mode ?? 'major',
    seventh: p.seventh === '1',
    picked: new Array(6).fill(null), // índice 0 = 6ª cuerda; null = no tocada, number = traste
    symbol: p.chord ?? 'Bm7',
    progression: p.prog ?? 'Am F C G',
  };

  const keyPanel = h('section', { class: 'panel' });
  const detectPanel = h('section', { class: 'panel' });
  const lookupPanel = h('section', { class: 'panel' });
  const songPanel = h('section', { class: 'panel' });

  /* ─── 1. Acordes de la tonalidad ─── */
  function renderKey() {
    clear(keyPanel);
    const chords = diatonicChords(state.root, state.mode, state.seventh);
    const row = h('div', { class: 'chord-row', style: 'margin-top:12px' });
    for (const c of chords) row.append(chordCard(engine, c, { roman: c.roman, notes: c.notes }));
    keyPanel.append(
      h('h2', {}, 'Acordes de una tonalidad'),
      h('div', { class: 'row' },
        select(rootChoices(), state.root, (v) => { state.root = v; ctx.session.set({ root: v }); ctx.setParams({ root: v }); renderKey(); }, { 'aria-label': 'Tónica', style: 'max-width:110px' }),
        select(MODE_CHOICES, state.mode, (v) => { state.mode = v; ctx.setParams({ mode: v }); renderKey(); }, { 'aria-label': 'Modo', style: 'max-width:190px' }),
        toggle('Con séptimas', state.seventh, (v) => { state.seventh = v; ctx.setParams({ seventh: v ? 1 : 0 }); renderKey(); }),
        button('Tocar todos ▶', { variant: 'accent', onClick: () => playAll(chords) }),
      ),
      row,
      h('p', { class: 'hint', style: 'margin-top:8px' }, 'Pulsa un acorde para oírlo. El número romano indica su grado dentro de la tonalidad.'),
    );
  }

  async function playAll(chords) {
    await engine.ensure();
    const t0 = engine.time + 0.1;
    chords.forEach((c, i) => engine.strum(guitarMidis(c.rootPc, c.typeId), t0 + i * 1.1, { vel: 0.7, dur: 1.4 }));
  }

  /* ─── 2. Nombra mi acorde ─── */
  function renderDetect() {
    clear(detectPanel);
    const grid = h('div', { class: 'pick-board' });
    grid.style.gridTemplateColumns = `34px repeat(14, 44px)`;
    grid.append(h('div'));
    ['×', ...Array.from({ length: 13 }, (_, i) => String(i))].forEach((label, i) => grid.append(h('div', { class: 'pick-head' }, i === 0 ? 'mute' : label)));
    // Filas: 1ª cuerda arriba (índice de pantalla 0..5 ↔ estado 5..0)
    for (let row = 0; row < 6; row += 1) {
      const si = 5 - row; // índice de estado (0 = 6ª)
      grid.append(h('div', { class: 'pick-head', style: 'align-self:center' }, `${row + 1}ª`));
      const options = [null, ...Array.from({ length: 13 }, (_, i) => i)];
      options.forEach((value) => {
        const on = state.picked[si] === value;
        const btn = h('button', { type: 'button', class: `pick-cell ${on ? 'is-on' : ''}`, 'aria-pressed': String(on), title: `Cuerda ${row + 1}, ${value === null ? 'silenciada' : `traste ${value}`}` }, value === null ? '×' : String(value));
        btn.addEventListener('click', () => {
          state.picked[si] = value;
          renderDetect();
        });
        grid.append(btn);
      });
    }
    const midis = [];
    state.picked.forEach((f, i) => { if (f !== null) midis.push(STD_LOW_TO_HIGH[i] + f); });
    const result = h('div', { class: 'stack', style: 'margin-top:12px' });
    if (midis.length >= 2) {
      const bass = Math.min(...midis);
      const pcs = midis.map((m) => mod(m, 12));
      const found = detectChords(pcs, mod(bass, 12), 'sharp');
      result.append(
        h('div', { class: 'pills' }, midis.sort((a, b) => a - b).map((m) => h('span', { class: 'pill' }, prettyNote(midiName(m))))),
        found.length
          ? h('div', {}, h('div', { class: 'big-number', style: 'font-size:2.4rem' }, prettyNote(found[0].symbol)), h('p', { class: 'hint' }, found[0].name),
            found.length > 1 ? h('p', { class: 'hint' }, `También podría ser: ${found.slice(1, 5).map((f) => prettyNote(f.symbol)).join(' · ')}`) : null)
          : h('p', { class: 'hint' }, 'No reconozco un acorde estándar con esas notas (prueba con más notas).'),
        h('div', { class: 'row' },
          button('Oír ▶', { variant: 'accent', onClick: async () => { await engine.ensure(); engine.strum([...midis].sort((a, b) => a - b), engine.time + 0.02, { vel: 0.75, dur: 2 }); } }),
          button('Limpiar', { variant: 'ghost', onClick: () => { state.picked.fill(null); renderDetect(); } }),
        ),
      );
    } else {
      result.append(h('p', { class: 'hint' }, 'Marca al menos dos notas: elige el traste de cada cuerda (× = silenciada o sin tocar).'));
    }
    detectPanel.append(h('h2', {}, 'Nombra mi acorde'), h('div', { class: 'table-wrap' }, grid), result);
  }

  /* ─── 3. Formas de un acorde ─── */
  function renderLookup() {
    clear(lookupPanel);
    const input = h('input', { type: 'text', value: state.symbol, placeholder: 'Bm7, F#7, Sol, Cmaj7…', 'aria-label': 'Acorde', style: 'max-width:200px' });
    const out = h('div', { class: 'chord-row', style: 'margin-top:12px' });
    const run = () => {
      clear(out);
      const parsed = parseChordSymbol(input.value);
      state.symbol = input.value;
      ctx.setParams({ chord: input.value });
      if (!parsed) {
        out.append(h('p', { class: 'hint' }, 'No reconozco ese acorde. Ejemplos: Am, F#m7b5, Bb/D, Sol, Do maj7 (sin espacios).'));
        return;
      }
      const shapes = chordShapes(parsed.rootPc, parsed.typeId);
      if (!shapes.length) {
        out.append(h('p', { class: 'hint' }, 'Aún no tengo formas guardadas para este tipo de acorde.'));
        return;
      }
      for (const shape of shapes.slice(0, 8)) {
        const card = h('button', { type: 'button', class: 'chord-card' },
          h('div', { class: 'roman' }, shape.label),
          h('div', { html: renderChordBox({ frets: shape.frets, title: parsed.symbol, rootStringIndex: shape.rootString != null ? 5 - shape.rootString : null }) }),
        );
        card.addEventListener('click', async () => {
          await engine.ensure();
          engine.strum(shapeMidis(shape.frets), engine.time + 0.02, { vel: 0.75, dur: 2 });
        });
        out.append(card);
      }
      out.append(h('div', { class: 'chord-notes', style: 'grid-column:1/-1' }, `Notas: ${chordNoteNames(parsed.rootName, parsed.typeId).join(' · ')} (${CHORD_TYPES[parsed.typeId].name})`));
    };
    input.addEventListener('input', run);
    lookupPanel.append(h('h2', {}, 'Formas de un acorde'), h('div', { class: 'row' }, input, button('Mostrar', { variant: 'accent', onClick: run })), out);
    run();
  }

  /* ─── 4. Tonalidad de una canción ─── */
  function renderSong() {
    clear(songPanel);
    const input = h('input', { type: 'text', value: state.progression, placeholder: 'Am F C G', 'aria-label': 'Acordes de la canción' });
    const out = h('div', { class: 'stack', style: 'margin-top:12px' });
    const run = () => {
      clear(out);
      state.progression = input.value;
      ctx.setParams({ prog: input.value });
      const symbols = input.value.split(/[\s,;|-]+/).filter(Boolean);
      const bad = symbols.filter((s) => !parseChordSymbol(s));
      const keys = findKeys(symbols.filter((s) => parseChordSymbol(s)));
      if (!keys.length) {
        out.append(h('p', { class: 'hint' }, 'Escribe acordes separados por espacios (por ejemplo: Am F C G).'));
        return;
      }
      if (bad.length) out.append(h('p', { class: 'hint' }, `No entiendo: ${bad.join(', ')}`));
      const best = keys[0];
      out.append(
        h('div', {}, h('div', { class: 'kicker' }, 'Tonalidad más probable'), h('div', { class: 'big-number', style: 'font-size:2.6rem' }, best.label), h('p', { class: 'hint' }, `${best.hits} de ${best.total} acordes pertenecen a la tonalidad.`)),
        h('div', { class: 'pills' }, best.detail.map((d) => h('span', { class: `pill ${d.inKey ? 'pill--ok' : 'pill--bad'}`, title: d.inKey ? 'Diatónico' : 'Fuera de la tonalidad' }, prettyNote(d.symbol)))),
        h('p', { class: 'hint' }, `Otras posibilidades: ${keys.slice(1, 4).map((k) => k.label).join(' · ')}`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].map((r) => h('th', {}, r)))), h('tbody', {}, h('tr', {}, best.chords.map((c) => h('td', {}, `${prettyNote(c.symbol)}`)))))),
        button('Ver todos los acordes de esta tonalidad', { variant: 'outline', onClick: () => { state.root = best.rootName; state.mode = best.mode; renderKey(); keyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
      );
    };
    input.addEventListener('input', run);
    songPanel.append(h('h2', {}, '¿En qué tonalidad está mi canción?'), h('p', { class: 'hint', style: 'margin-bottom:8px' }, 'Escribe los acordes y te digo la tonalidad y cuáles encajan.'), input, out);
    run();
  }

  root.append(
    header('Aprender el mástil', 'Chord & Key Finder', 'Nombra un acorde a partir de sus notas, consulta sus formas, lista los acordes de cualquier tonalidad y descubre la tonalidad de una canción.'),
    keyPanel,
    h('div', { class: 'grid-2', style: 'align-items:start' }, detectPanel, h('div', { class: 'stack' }, lookupPanel, songPanel)),
  );
  renderKey();
  renderDetect();
  renderLookup();
  renderSong();
  void pcName;
}

export default {
  id: 'chords',
  title: 'Chord & Key Finder',
  group: 'neck',
  icon: '♬',
  summary: 'Nombra acordes, ve sus formas, acordes por tonalidad y tonalidad de una canción.',
  isNew: true,
  mount,
};
