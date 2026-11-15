/** Strum Trainer: construye patrones de rasgueo y escúchalos sobre una progresión. */

import { STRUM_PRESETS, cycleStep, isDownStrum, strumToText } from '../core/rhythm.js';
import { parseChordSymbol } from '../core/chords.js';
import { coerce } from '../core/state.js';
import { Transport } from '../audio/transport.js';
import { guitarMidis } from '../audio/backing.js';
import { renderChordBox } from '../ui/chordbox.js';
import { bestShape } from '../core/chords.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, playToggle } from './common.js';

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const state = {
    steps: coerce(p.steps, 8),
    pattern: p.pat ? [...p.pat].map(Number) : [...STRUM_PRESETS.pop.pattern],
    chords: p.chords ?? 'G D Em C',
    bpm: coerce(p.bpm, 90),
    swing: 0.5,
    countIn: true,
    click: false,
    vol: 0.8,
  };
  const cells = [];
  const chordsOut = h('div', { class: 'row', style: 'justify-content:center' });
  const patternText = h('p', { class: 'mono', style: 'text-align:center;font-size:1.3rem;margin-top:8px' });
  const gridEl = h('div', { class: 'seq-grid' });
  const countRow = h('div', { class: 'count-row' });
  const transport = new Transport(engine, 'strum');
  transport.onStop = () => {
    play.set(false);
    cells.forEach((c) => c.classList.remove('is-now'));
    chordsOut.querySelectorAll('.chord-card').forEach((c) => c.classList.remove('is-active'));
  };
  ctx.onCleanup(() => transport.stop());
  const play = playToggle({ startLabel: '▶ Tocar', onStart: () => start(), onStop: () => transport.stop(), size: 'btn-lg' });

  const parsedChords = () => state.chords.split(/[\s,;|-]+/).filter(Boolean).map(parseChordSymbol).filter(Boolean);

  function drawChords() {
    clear(chordsOut);
    const list = parsedChords();
    if (!list.length) {
      chordsOut.append(h('p', { class: 'hint' }, 'Escribe acordes separados por espacios.'));
      return;
    }
    list.forEach((c, i) => {
      const shape = bestShape(c.rootPc, c.typeId);
      chordsOut.append(h('div', { class: 'chord-card', style: 'cursor:default', dataset: { i } }, h('div', { html: renderChordBox({ frets: shape.frets, title: c.symbol }) })));
    });
  }

  function drawGrid() {
    clear(gridEl);
    cells.length = 0;
    const n = state.steps;
    const row = h('div', { class: 'seq-row' });
    row.style.gridTemplateColumns = `repeat(${n}, minmax(34px, 1fr))`;
    const labels = n === 8
      ? ['1', '&', '2', '&', '3', '&', '4', '&']
      : ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
    clear(countRow);
    countRow.style.gridTemplateColumns = row.style.gridTemplateColumns;
    labels.forEach((l) => countRow.append(h('div', {}, l)));
    state.pattern.forEach((value, i) => {
      const cell = h('button', { type: 'button', class: 'seq-cell', dataset: { state: value }, 'aria-label': `Paso ${labels[i]}` });
      paintCell(cell, i);
      cell.addEventListener('click', async () => {
        state.pattern[i] = cycleStep(state.pattern[i]);
        paintCell(cell, i);
        patternText.textContent = strumToText(state.pattern, state.steps);
        ctx.setParams({ pat: state.pattern.join('') });
        const list = parsedChords();
        if (state.pattern[i] && list[0]) {
          await engine.ensure();
          engine.strum(guitarMidis(list[0].rootPc, list[0].typeId), engine.time + 0.01, strumOpts(state.pattern[i], i));
        }
      });
      cells.push(cell);
      row.append(cell);
    });
    gridEl.append(countRow, row);
    patternText.textContent = strumToText(state.pattern, state.steps);
  }

  function paintCell(cell, i) {
    const v = state.pattern[i];
    cell.dataset.state = String(v);
    cell.classList.toggle('is-on', v === 1);
    cell.textContent = v === 0 ? '·' : v === 3 ? '✕' : isDownStrum(i, state.steps) ? '↓' : '↑';
  }

  function strumOpts(value, i) {
    const down = isDownStrum(i, state.steps);
    return { down, vel: (value === 2 ? 0.95 : 0.62) * state.vol, mute: value === 3, dur: 1.2, spread: down ? 0.016 : 0.012 };
  }

  async function start() {
    const list = parsedChords();
    if (!list.length) {
      ctx.toast('Añade al menos un acorde');
      throw new Error('sin acordes');
    }
    await engine.ensure();
    const n = state.steps;
    const perBeat = n / 4;
    const countSteps = state.countIn ? 4 * perBeat : 0;
    await transport.start({
      stepSeconds: () => 60 / state.bpm / perBeat,
      tick: (step, time) => {
        const sec = 60 / state.bpm / perBeat;
        if (step < countSteps) {
          if (step % perBeat === 0) engine.click(time, { accent: step === 0, sound: 'wood' });
          return true;
        }
        const s = step - countSteps;
        const i = s % n;
        const bar = Math.floor(s / n);
        const chord = list[bar % list.length];
        const delay = n === 8 && i % 2 === 1 ? (state.swing - 0.5) * 2 * sec : 0;
        const value = state.pattern[i];
        if (value) engine.strum(guitarMidis(chord.rootPc, chord.typeId), time + delay, strumOpts(value, i));
        if (state.click && i % perBeat === 0) engine.click(time, { accent: i === 0, sound: 'hat', vol: 0.5 });
        engine.at(time, () => {
          cells.forEach((c, k) => c.classList.toggle('is-now', k === i));
          chordsOut.querySelectorAll('.chord-card').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.i) === bar % list.length));
        });
        return true;
      },
    });
  }

  const chordInput = h('input', { type: 'text', value: state.chords, 'aria-label': 'Acordes', placeholder: 'G D Em C' });
  chordInput.addEventListener('input', () => {
    state.chords = chordInput.value;
    ctx.setParams({ chords: chordInput.value });
    drawChords();
  });

  root.append(
    header('Practicar', 'Strum Trainer', 'Crea un patrón de rasgueo con acentos, apagados y silencios, y escúchalo sobre una progresión. Pulsa cada paso para cambiarlo: silencio → rasgueo → acento → apagado.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' },
        chordsOut,
        gridEl,
        patternText,
        h('div', { class: 'row', style: 'justify-content:center' }, play.el),
        h('p', { class: 'hint', style: 'text-align:center' }, '↓ hacia abajo · ↑ hacia arriba · ✕ apagado (muted) · · silencio. Los acentos se muestran en naranja.'),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, h('h2', {}, 'Patrón'),
          h('div', { class: 'field' }, h('label', {}, 'Predefinidos'), select(
            Object.entries(STRUM_PRESETS).map(([value, v]) => ({ value, label: v.label })), 'pop',
            (v) => { const pre = STRUM_PRESETS[v]; state.steps = pre.steps; state.pattern = [...pre.pattern]; drawGrid(); ctx.setParams({ steps: state.steps, pat: state.pattern.join('') }); },
          )),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Pasos'), segmented([{ value: 8, label: '8 (corcheas)' }, { value: 16, label: '16 (semicorcheas)' }], state.steps, (v) => {
            const next = Number(v);
            if (next === state.steps) return;
            state.pattern = next === 16
              ? state.pattern.flatMap((x, i) => (i % 1 === 0 ? [x, 0] : []))
              : state.pattern.filter((_, i) => i % 2 === 0);
            state.steps = next;
            drawGrid();
          })),
          button('Borrar patrón', { variant: 'ghost', onClick: () => { state.pattern = new Array(state.steps).fill(0); drawGrid(); } }),
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Acordes (un compás cada uno)'), chordInput,
          h('p', { class: 'hint' }, 'Ejemplos: G D Em C · Am F C G · Dm7 G7 Cmaj7'),
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Reproducción'),
          slider({ min: 40, max: 200, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; ctx.setParams({ bpm: v }); } }),
          slider({ min: 50, max: 72, value: 50, label: 'Swing', format: (v) => `${v}%`, onInput: (v) => { state.swing = v / 100; } }),
          slider({ min: 20, max: 100, value: 80, label: 'Volumen', format: (v) => `${v}%`, onInput: (v) => { state.vol = v / 100; } }),
          toggle('Cuenta previa', state.countIn, (v) => { state.countIn = v; }),
          toggle('Click de metrónomo', state.click, (v) => { state.click = v; }),
        ),
      ),
    ),
  );
  drawChords();
  drawGrid();
}

export default {
  id: 'strum',
  title: 'Strum Trainer',
  group: 'practice',
  icon: '≋',
  summary: 'Patrones de rasgueo con acentos, apagados y silencios sobre tus acordes.',
  isNew: true,
  mount,
};
