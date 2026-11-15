/** Exercise Generator: secuencias de escala, arpegio y pentatónica con tab y reproducción. */

import { TUNINGS, getTuning, collectBoardNotes } from '../core/music.js';
import {
  PATTERNS, buildSequence, ladderBox, ladderPerString, positionLabel, rootPosition, sweepSequence,
} from '../core/exercises.js';
import { tabFromSequence, tabToAscii, tabToJson } from '../core/tab.js';
import { coerce } from '../core/state.js';
import { Transport } from '../audio/transport.js';
import { clearPlaying, renderFretboard, setPlaying, hitFromEvent, flashNote } from '../ui/fretboard.js';
import { button, clear, copyText, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, playToggle, safeCollection, scalePicker } from './common.js';

const SUBS = [
  { value: 1, label: 'Negras' },
  { value: 2, label: 'Corcheas' },
  { value: 3, label: 'Tresillos' },
  { value: 4, label: 'Semicorcheas' },
];

const DIRS = [
  { value: 'up', label: '↑ Subir' },
  { value: 'down', label: '↓ Bajar' },
  { value: 'updown', label: '↑↓ Ida y vuelta' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const sess = ctx.session.get();
  const p = ctx.params;
  const state = {
    root: p.root ?? sess.root,
    family: p.fam ?? sess.family,
    quality: p.q ?? sess.quality,
    tuning: p.tun ?? 'standard',
    posMode: p.pm ?? 'nps',
    posIndex: coerce(p.pi, -1),
    boxStart: coerce(p.bs, 5),
    pattern: p.pat ?? 'straight',
    dir: p.dir ?? 'updown',
    sub: coerce(p.sub, 2),
    bpm: coerce(p.bpm, 80),
    loop: coerce(p.loop, true),
    countIn: coerce(p.ci, true),
    click: coerce(p.click, true),
    sweep: false,
  };
  let sequence = [];
  let ladder = [];
  let tuningMidi = getTuning(state.tuning).midi;

  const board = h('div', { class: 'fb-wrap' });
  const tabBox = h('div', { class: 'tab-view', id: 'tab-out', 'aria-label': 'Tablatura del ejercicio' });
  const meta = h('p', { class: 'hint' });
  const positionControls = h('div', { class: 'stack' });
  const transport = new Transport(engine, 'exercises');
  transport.onStop = () => {
    play.set(false);
    clearPlaying(board);
    tabBox.querySelectorAll('.tab-now').forEach((el) => el.classList.remove('tab-now'));
  };
  ctx.onCleanup(() => transport.stop());

  const play = playToggle({
    startLabel: '▶ Tocar ejercicio',
    onStart: () => start(),
    onStop: () => transport.stop(),
    size: 'btn-lg',
  });

  const picker = scalePicker({
    root: state.root,
    family: state.family,
    quality: state.quality,
    onChange: (v) => {
      Object.assign(state, v, { posIndex: -1 });
      ctx.session.set({ root: v.root, family: v.family, quality: v.quality });
      render();
    },
  });

  function build() {
    tuningMidi = getTuning(state.tuning).midi;
    const collection = safeCollection(state.root, state.family, state.quality);
    if (state.posIndex < 0) state.posIndex = rootPosition(tuningMidi, collection);
    const count = positionLabel(tuningMidi, collection, 0).count;
    if (state.posIndex >= count) state.posIndex = 0;
    let result;
    if (state.posMode === 'box') result = ladderBox({ tuning: tuningMidi, collection, startFret: state.boxStart, span: 5 });
    else result = ladderPerString({ tuning: tuningMidi, collection, position: state.posIndex, maxFret: 24 });
    ladder = result.ladder;
    sequence = state.sweep
      ? sweepSequence({ tuning: tuningMidi, collection, startFret: state.boxStart, span: 5 })
      : buildSequence(ladder, state.pattern, state.dir);
    return { collection, count, partial: result.partial };
  }

  function drawTab() {
    const per = 12;
    const parts = [];
    const strings = tuningMidi.length;
    const labels = strings === 6 ? ['e', 'B', 'G', 'D', 'A', 'E'] : Array.from({ length: strings }, (_, i) => String(i + 1));
    for (let start = 0; start < sequence.length; start += per) {
      const chunk = sequence.slice(start, start + per);
      for (let s = 0; s < strings; s += 1) {
        let line = `${labels[s].padEnd(2)}|`;
        chunk.forEach((n, i) => {
          const cell = (n.s === s ? String(n.f) : '').padEnd(3, '-');
          line += `<span data-i="${start + i}">${cell}</span>`;
        });
        parts.push(`${line}|`);
      }
      parts.push('');
    }
    tabBox.innerHTML = parts.join('\n').trimEnd();
  }

  function render() {
    const { collection, count, partial } = build();
    clear(positionControls);
    positionControls.append(
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Posición'), segmented([{ value: 'nps', label: 'N por cuerda' }, { value: 'box', label: 'Caja' }], state.posMode, (v) => { state.posMode = v; render(); })),
    );
    if (state.posMode === 'nps') {
      positionControls.append(
        h('div', { class: 'field' }, h('label', {}, 'Nota de arranque'), select(
          Array.from({ length: count }, (_, i) => {
            const l = positionLabel(tuningMidi, collection, i);
            return { value: i, label: `${i + 1} · ${l.note.name} (traste ${l.fret})` };
          }),
          state.posIndex,
          (v) => { state.posIndex = Number(v); render(); },
        )),
      );
    } else {
      positionControls.append(slider({ min: 0, max: 19, value: state.boxStart, label: 'Traste', onInput: (v) => { state.boxStart = v; render(); } }));
    }
    const frets = ladder.map((n) => n.f);
    const lo = ladder.length ? Math.max(0, Math.min(...frets) - 1) : 0;
    const hi = ladder.length ? Math.min(24, Math.max(...frets) + 2) : 12;
    const from = Math.min(lo, 0) === 0 && lo <= 2 ? 0 : lo;
    const set = new Set(ladder.map((n) => `${n.s}-${n.f}`));
    const roles = collectBoardNotes({ tuning: tuningMidi, collection, fromFret: from, toFret: Math.max(hi, from + 5) });
    const notes = roles
      .filter((n) => set.has(`${n.s}-${n.f}`))
      .map((n) => ({ s: n.s, f: n.f, label: n.name, role: n.isRoot ? 'root' : null }));
    board.innerHTML = renderFretboard({ tuning: tuningMidi, from, to: Math.max(hi, from + 5), notes, title: `${collection.title} – posición` });
    drawTab();
    meta.textContent = `${collection.title} · ${sequence.length} notas${partial ? ' · posición parcial (no cabe en el mástil)' : ''}`;
    ctx.setParams({
      root: state.root, fam: state.family, q: state.quality, tun: state.tuning, pm: state.posMode, pi: state.posIndex,
      bs: state.boxStart, pat: state.pattern, dir: state.dir, sub: state.sub, bpm: state.bpm, loop: state.loop ? 1 : 0,
      ci: state.countIn ? 1 : 0, click: state.click ? 1 : 0,
    });
  }

  async function start() {
    await engine.ensure();
    if (!sequence.length) throw new Error('Sin notas');
    const beatSteps = state.sub;
    const countSteps = state.countIn ? 4 * beatSteps : 0;
    const total = countSteps + sequence.length;
    await transport.start({
      stepSeconds: () => 60 / state.bpm / state.sub,
      tick: (step, time) => {
        const dur = 60 / state.bpm / state.sub;
        let idx = step;
        if (idx >= total) {
          if (!state.loop) {
            engine.at(time + 0.3, () => transport.stop());
            return false;
          }
          idx = (idx - countSteps) % sequence.length + countSteps;
          if (idx >= total) idx = countSteps;
        }
        if (idx < countSteps) {
          if (idx % beatSteps === 0) engine.click(time, { accent: idx === 0, sound: 'wood' });
          return true;
        }
        const n = idx - countSteps;
        const note = sequence[n];
        if ((step - 0) % beatSteps === 0 && state.click && idx >= countSteps) {
          engine.click(time, { accent: false, sound: 'hat', vol: 0.5 });
        }
        engine.pluck(note.midi, time, { dur: dur * 1.7, vel: 0.8 });
        engine.at(time, () => {
          clearPlaying(board);
          setPlaying(board, note.s, note.f, true);
          tabBox.querySelectorAll('.tab-now').forEach((el) => el.classList.remove('tab-now'));
          tabBox.querySelectorAll(`[data-i="${n}"]`).forEach((el) => el.classList.add('tab-now'));
        });
        return true;
      },
    });
  }

  board.addEventListener('click', async (e) => {
    const hit = hitFromEvent(e);
    if (!hit) return;
    await engine.ensure();
    engine.pluck(tuningMidi[hit.s] + hit.f, engine.time + 0.005, { vel: 0.85 });
    flashNote(board, hit.s, hit.f);
  });

  const asciiText = () => tabToAscii(tabFromSequence(sequence, { strings: tuningMidi.length }), 16);

  root.append(
    header('Practicar', 'Exercise Generator', 'Secuencias de escala, pentatónica y arpegio en cualquier tonalidad y posición, con tab, bucle, cuenta previa y metrónomo. Perfectas para calentar y ganar velocidad.'),
    h('div', { class: 'tool-grid' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, h('h2', {}, 'Material'), picker.el,
          h('div', { class: 'field' }, h('label', {}, 'Afinación'), select(Object.values(TUNINGS).filter((t) => t.midi.length === 6).map((t) => ({ value: t.id, label: t.label })), state.tuning, (v) => { state.tuning = v; state.posIndex = -1; render(); })),
          positionControls,
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Patrón'),
          h('div', { class: 'field' }, h('label', {}, 'Secuencia'), select(Object.entries(PATTERNS).map(([value, v]) => ({ value, label: v.label })), state.pattern, (v) => { state.pattern = v; state.sweep = false; render(); })),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Dirección'), segmented(DIRS, state.dir, (v) => { state.dir = v; render(); })),
          toggle('Arpegio «sweep» (una nota por cuerda)', state.sweep, (v) => { state.sweep = v; render(); }),
        ),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Reproducción'),
          slider({ min: 40, max: 220, value: state.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { state.bpm = v; ctx.setParams({ bpm: v }); } }),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Subdivisión'), segmented(SUBS, state.sub, (v) => { state.sub = Number(v); ctx.setParams({ sub: v }); })),
          toggle('Repetir en bucle', state.loop, (v) => { state.loop = v; }),
          toggle('Cuenta previa de un compás', state.countIn, (v) => { state.countIn = v; }),
          toggle('Click en cada pulso', state.click, (v) => { state.click = v; }),
          play.el,
        ),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel' }, board, meta),
        h('section', { class: 'panel' },
          h('div', { class: 'row row--between' }, h('h2', {}, 'Tablatura'),
            h('div', { class: 'row no-print' },
              button('Copiar', { variant: 'outline', onClick: async () => ctx.toast((await copyText(asciiText())) ? 'Tab copiada' : 'No se pudo copiar') }),
              button('Imprimir / PDF', { variant: 'outline', onClick: () => window.print() }),
              button('Abrir en Tab Creator', { variant: 'dark', onClick: () => {
                const tab = tabFromSequence(sequence, { strings: tuningMidi.length, title: `Ejercicio ${safeCollection(state.root, state.family, state.quality).title}`, tempo: state.bpm });
                tab.subdivision = state.sub;
                ctx.storage.set('tab-handoff', tabToJson(tab));
                ctx.go('tab', { handoff: 1 });
              } }))),
          tabBox,
        ),
      ),
    ),
  );
  render();
}

export default {
  id: 'exercises',
  title: 'Exercise Generator',
  group: 'practice',
  icon: '⚡',
  summary: 'Secuencias de escala, pentatónica y arpegio con tab, tempo, bucle y cuenta previa.',
  mount,
};
