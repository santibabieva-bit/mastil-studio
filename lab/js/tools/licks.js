/**
 * Licks en las 12 tonalidades: elige o escribe una frase, la app la
 * transpone por el círculo de quintas y la practica en llamada y respuesta.
 */

import { TUNINGS, midiName, pcName, prettyNote } from '../core/music.js';
import {
  BUILTIN_LICKS, collapseNotes, lickInAllKeys, lickToText, matchLick, parseLick,
} from '../core/licks.js';
import { detectPitch } from '../core/pitch.js';
import { Transport } from '../audio/transport.js';
import { openMic } from '../audio/mic.js';
import {
  button, clear, h, segmented, select, slider,
} from '../ui/dom.js';
import { header, playToggle } from './common.js';

const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const custom = ctx.storage.get('licks-custom', []);
  const all = () => [...BUILTIN_LICKS, ...custom];
  const cfg = {
    lick: ctx.storage.get('licks-id', BUILTIN_LICKS[0].id),
    order: 'fifths',
    index: 0,
    bpm: ctx.storage.get('licks-bpm', 70),
    mode: 'call',
    mic: false,
  };
  const transport = new Transport(engine, 'licks');
  let mic = null;
  let frames = [];
  let micTimer = 0;
  const buf = new Float32Array(2048);
  const stage = h('div', { class: 'stack' });
  const keyGrid = h('div', { class: 'key-grid' });
  const status = h('div', { class: 'feedback', hidden: true });
  const phase = h('div', { class: 'tempo-name', style: 'text-align:center;min-height:1.4em' }, '');

  const play = playToggle({ startLabel: '▶ Llamada y respuesta', stopLabel: '■ Parar', onStart: () => start(), onStop: () => stop(), size: 'btn-lg' });
  transport.onStop = () => { play.set(false); phase.textContent = ''; clearInterval(micTimer); };
  ctx.onCleanup(() => { transport.stop(); clearInterval(micTimer); mic?.close(); });

  const current = () => all().find((l) => l.id === cfg.lick) ?? BUILTIN_LICKS[0];
  const keys = () => lickInAllKeys(current(), { order: cfg.order });
  const stepsOf = (lick) => lick.notes.reduce((a, n) => a + (n[2] ?? 1), 0);

  function showMsg(text, kind = 'ok') { status.hidden = !text; status.className = `feedback ${kind}`; status.textContent = text; }

  function tabView(lick) {
    const cols = lick.notes;
    const rows = STRING_NAMES.map((name, s) => h('div', { class: 'tab-row' }, h('span', { class: 'tab-label' }, name), ...cols.map(([ns, f]) => h('span', { class: `tab-cell ${ns === s ? 'has-note' : ''}` }, ns === s ? String(f) : '·'))));
    return h('div', { class: 'drill-tab' }, h('div', { class: 'tab-line' }, ...rows));
  }

  function drawKeys() {
    clear(keyGrid);
    keys().forEach((k, i) => {
      const b = h('button', { type: 'button', class: `key-btn ${i === cfg.index ? 'is-active' : ''} ${k.lick ? '' : 'is-off'}`, disabled: !k.lick }, prettyNote(pcName(k.rootPc, 'sharp')));
      b.addEventListener('click', () => { cfg.index = i; draw(); previewKey(); });
      keyGrid.append(b);
    });
  }

  async function previewKey() {
    await engine.ensure();
    const k = keys()[cfg.index]?.lick;
    if (!k) return;
    let t = engine.time + 0.05;
    const step = 60 / cfg.bpm / (k.subdivision ?? 2);
    for (const [s, f, d = 1] of k.notes) { engine.pluck(tuning[s] + f, t, { dur: step * d * 1.8, vel: 0.85 }); t += step * d; }
  }

  /** Línea de tiempo completa: por cada tonalidad, la llamada y el hueco para responder. */
  function buildSlots(list) {
    const slots = [];
    list.forEach((k, idx) => {
      if (!k.lick) return;
      const sub = k.lick.subdivision ?? 2;
      const total = stepsOf(k.lick);
      const expected = k.lick.notes.map(([s, f]) => tuning[s] + f);
      const starts = new Map();
      let acc = 0;
      for (const n of k.lick.notes) { starts.set(acc, n); acc += n[2] ?? 1; }
      for (let i = 0; i < total + 2; i += 1) slots.push({ kind: 'call', idx, sub, note: starts.get(i) ?? null, first: i === 0 });
      for (let i = 0; i < total + 2; i += 1) slots.push({ kind: 'resp', idx, sub, local: i, last: i === total + 1, first: i === 0, expected, rootPc: k.rootPc });
    });
    return slots;
  }

  async function start() {
    await engine.ensure();
    const list = keys();
    const slots = buildSlots(list);
    if (!slots.length) return;
    await transport.start({
      stepSeconds: (step) => 60 / cfg.bpm / (slots[Math.min(step, slots.length - 1)].sub),
      tick: (step, time) => {
        const slot = slots[step];
        if (!slot) return false;
        const dur = 60 / cfg.bpm / slot.sub;
        if (slot.kind === 'call') {
          if (slot.first) engine.at(time, () => { cfg.index = slot.idx; drawKeys(); phase.textContent = `Escucha — ${prettyNote(pcName(list[slot.idx].rootPc, 'sharp'))}`; });
          if (slot.note) engine.pluck(tuning[slot.note[0]] + slot.note[1], time, { dur: dur * (slot.note[2] ?? 1) * 1.8, vel: 0.85 });
        } else {
          if (slot.first) engine.at(time, () => { phase.textContent = 'Tu turno'; if (cfg.mic) startListening(); });
          if (slot.local % slot.sub === 0) engine.click(time, { accent: slot.local === 0, sound: 'click', vol: 0.4 });
          if (slot.last) engine.at(time, () => evaluate(slot.expected, slot.rootPc));
        }
        return true;
      },
    });
  }

  function stop() { transport.stop(); }

  async function startListening() {
    if (!mic) { try { mic = await openMic(engine, { fftSize: 2048 }); } catch { showMsg('No puedo usar el micrófono.', 'bad'); cfg.mic = false; return; } }
    frames = [];
    clearInterval(micTimer);
    micTimer = setInterval(() => {
      mic.analyser.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1400, threshold: 0.01 });
      frames.push(f ? Math.round(69 + 12 * Math.log2(f / 440)) : null);
    }, 30);
  }

  function evaluate(expected, rootPc) {
    if (!cfg.mic) return;
    clearInterval(micTimer);
    const played = collapseNotes(frames, 3);
    const m = matchLick(played, expected);
    showMsg(`${prettyNote(pcName(rootPc, 'sharp'))}: ${m.hits}/${m.total} notas correctas (${Math.round(m.ratio * 100)} %).`, m.ratio >= 0.8 ? 'ok' : 'bad');
    frames = [];
  }

  function draw() {
    clear(stage);
    const lick = current();
    const shown = keys()[cfg.index]?.lick ?? lick;
    drawKeys();
    stage.append(
      h('section', { class: 'panel stack' },
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Lick'), select(all().map((l) => ({ value: l.id, label: `${l.name} · ${l.style}` })), cfg.lick, (v) => { transport.stop(); cfg.lick = v; cfg.index = 0; ctx.storage.set('licks-id', v); draw(); })),
          h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Orden de tonalidades'), segmented([{ value: 'fifths', label: 'Círculo de quintas' }, { value: 'chromatic', label: 'Cromático' }], cfg.order, (v) => { cfg.order = v; cfg.index = 0; draw(); })),
        ),
        h('p', { class: 'hint' }, `En ${prettyNote(pcName(shown.rootPc, 'sharp'))}: ${lickToText(shown.notes)} (cuerda:traste; 1 = cuerda más aguda).`),
        tabView(shown),
        h('div', { class: 'row' }, button('🔊 Oír esta tonalidad', { variant: 'outline', onClick: previewKey })),
        h('h2', {}, 'Las 12 tonalidades'),
        keyGrid,
      ),
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Llamada y respuesta'),
        h('p', { class: 'hint' }, 'La app toca el lick en una tonalidad, tú lo repites en el silencio que sigue y pasa a la siguiente tonalidad del círculo. Con micrófono, además mide cuántas notas aciertas.'),
        slider({ min: 40, max: 160, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; ctx.storage.set('licks-bpm', v); } }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Evaluar con micrófono'), segmented([{ value: 'off', label: 'No' }, { value: 'on', label: 'Sí' }], cfg.mic ? 'on' : 'off', (v) => { cfg.mic = v === 'on'; })),
        h('div', { class: 'row', style: 'justify-content:center' }, play.el),
        phase,
        status,
      ),
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Añade tu propio lick'),
        h('div', { class: 'row' },
          h('input', { type: 'text', id: 'lick-name', placeholder: 'Nombre', 'aria-label': 'Nombre del lick', style: 'flex:1;min-width:8rem' }),
          h('input', { type: 'text', id: 'lick-notes', placeholder: 'Notas cuerda:traste, p. ej. 2:5 2:8 1:5 1:8', 'aria-label': 'Notas', style: 'flex:2;min-width:12rem' }),
        ),
        h('div', { class: 'field' }, h('label', {}, 'Tónica del lick (nota en la que está escrito)'), select(Array.from({ length: 12 }, (_, i) => ({ value: i, label: prettyNote(pcName(i, 'sharp')) })), 9, () => {}, { id: 'lick-root' })),
        button('Guardar lick', { variant: 'accent', onClick: saveCustom }),
        h('p', { class: 'hint', id: 'lick-hint' }, 'Cada nota se escribe «cuerda:traste». La cuerda 1 es la más aguda. Se transpone en bloque, sin cambiar la digitación relativa.'),
      ),
    );
  }

  function saveCustom() {
    const name = root.querySelector('#lick-name').value.trim() || 'Mi lick';
    const notes = parseLick(root.querySelector('#lick-notes').value);
    const hint = root.querySelector('#lick-hint');
    if (!notes) { hint.textContent = 'No entiendo las notas: usa «cuerda:traste» separadas por espacios.'; return; }
    const rootPc = Number(root.querySelector('#lick-root').value);
    const lick = { id: `custom-${Date.now()}`, name, style: 'Propio', rootPc, notes, subdivision: 2 };
    custom.push(lick);
    ctx.storage.set('licks-custom', custom);
    cfg.lick = lick.id;
    cfg.index = 0;
    ctx.storage.set('licks-id', lick.id);
    draw();
  }

  root.append(
    header('Tocar y escribir', 'Licks en 12 tonalidades', 'Aprende una frase y llévala a todas las tonalidades por el círculo de quintas. Practica en llamada y respuesta, con evaluación opcional por micrófono.'),
    stage,
  );
  void midiName;
  draw();
}

export default {
  id: 'licks',
  title: 'Licks y respuesta',
  group: 'play',
  icon: '♫',
  summary: 'Transpón un lick a las 12 tonalidades y practícalo en llamada y respuesta.',
  isNew: true,
  mount,
};
