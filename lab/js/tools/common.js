/** Piezas compartidas por varias herramientas. */

import {
  FAMILY_DEFS, ROOT_CHOICES, createNoteCollection, midiToFreq, prettyNote,
} from '../core/music.js';
import { guitarMidis } from '../audio/backing.js';
import { h, select } from '../ui/dom.js';

export const FAMILY_CHOICES = [
  { value: 'scale', label: 'Escala' },
  { value: 'arpeggio', label: 'Arpegio (7ª)' },
  { value: 'triad', label: 'Tríada / acorde' },
];

export function rootChoices() {
  return ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) }));
}

export function qualityChoices(family) {
  const def = FAMILY_DEFS[family] ?? FAMILY_DEFS.scale;
  return Object.values(def.qualities).map((q) => ({ value: q.id, label: q.label }));
}

export function safeCollection(root, family, quality) {
  const def = FAMILY_DEFS[family] ?? FAMILY_DEFS.scale;
  const q = def.qualities[quality] ? quality : def.defaultQuality;
  return createNoteCollection(root, family, q);
}

export function header(kicker, title, description, ...actions) {
  return h(
    'div',
    { class: 'tool-head' },
    h('div', {}, h('div', { class: 'kicker' }, kicker), h('h1', {}, title), description ? h('p', {}, description) : null),
    actions.length ? h('div', { class: 'row no-print' }, ...actions) : null,
  );
}

/** Selector «familia + calidad» enlazado: devuelve { el, get, set }. */
export function scalePicker({ root, family, quality, onChange, families = FAMILY_CHOICES }) {
  const state = { root, family, quality };
  const rootSel = select(rootChoices(), state.root, (v) => {
    state.root = v;
    onChange({ ...state });
  });
  const famSel = select(families, state.family, (v) => {
    state.family = v;
    const def = FAMILY_DEFS[v];
    if (!def.qualities[state.quality]) state.quality = def.defaultQuality;
    refreshQuality();
    onChange({ ...state });
  });
  const qualSel = select(qualityChoices(state.family), state.quality, (v) => {
    state.quality = v;
    onChange({ ...state });
  });
  function refreshQuality() {
    qualSel.replaceChildren(...qualityChoices(state.family).map((o) => h('option', { value: o.value }, o.label)));
    qualSel.value = state.quality;
  }
  const el = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', {}, 'Tónica'), rootSel), h('div', { class: 'field' }, h('label', {}, 'Tipo'), famSel)),
    h('div', { class: 'field' }, h('label', {}, 'Calidad'), qualSel),
  );
  return {
    el,
    get: () => ({ ...state }),
    set(next) {
      Object.assign(state, next);
      rootSel.value = state.root;
      famSel.value = state.family;
      refreshQuality();
    },
  };
}

/** Reproduce un acorde con la forma más cómoda. */
export async function playChordNow(engine, chord, { down = true, vel = 0.75 } = {}) {
  await engine.ensure();
  engine.strum(guitarMidis(chord.rootPc, chord.typeId), engine.time + 0.02, { down, vel, dur: 1.8 });
}

export async function playMidi(engine, midi, opts = {}) {
  await engine.ensure();
  engine.pluck(midi, engine.time + 0.01, { dur: 1.4, vel: 0.85, ...opts });
}

export function freqLabel(midi) {
  return `${midiToFreq(midi).toFixed(1)} Hz`;
}

/** Botón reproducir/detener que alterna su rótulo. */
export function playToggle({ onStart, onStop, startLabel = '▶ Reproducir', stopLabel = '■ Detener', variant = 'accent', size = '' }) {
  let running = false;
  const btn = h('button', { type: 'button', class: `btn btn-${variant} ${size}`.trim() }, startLabel);
  const set = (value) => {
    running = value;
    btn.textContent = running ? stopLabel : startLabel;
    btn.classList.toggle('is-running', running);
    btn.setAttribute('aria-pressed', String(running));
  };
  btn.addEventListener('click', async () => {
    if (running) {
      set(false);
      onStop();
    } else {
      set(true);
      try {
        await onStart();
      } catch (error) {
        console.error(error);
        set(false);
      }
    }
  });
  return { el: btn, set, get running() { return running; } };
}

export const BPM_NAMES = [
  [40, 'Largo'], [60, 'Adagio'], [76, 'Andante'], [108, 'Moderato'], [120, 'Allegro moderato'], [156, 'Allegro'], [176, 'Vivace'], [999, 'Presto'],
];

export function tempoName(bpm) {
  return BPM_NAMES.find(([max]) => bpm < max)?.[1] ?? 'Presto';
}
