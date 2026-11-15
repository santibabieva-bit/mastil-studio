/** Fretboard Navigator: escalas, arpegios y acordes con audio, posiciones y voicings. */

import {
  TUNINGS, collectBoardNotes, degreeLabel, getTuning, midiToFreq, midiName, prettyNote, solfege,
} from '../core/music.js';
import { stringSetVoicings } from '../core/chords.js';
import { guitarMidis } from '../audio/backing.js';
import {
  ladderBox, ladderPerString, positionLabel, rootPosition,
} from '../core/exercises.js';
import { coerce } from '../core/state.js';
import { buildDiagram } from '../../../src/diagram.js';
import { Transport } from '../audio/transport.js';
import { listenMidi } from '../audio/midiin.js';
import { renderChordBox } from '../ui/chordbox.js';
import { svgToPngBlob, saveBlob, slug } from '../ui/export.js';
import { flashNote, hitFromEvent, renderFretboard, setPlaying, clearPlaying } from '../ui/fretboard.js';
import {
  button, clear, h, select, segmented, toggle, slider,
} from '../ui/dom.js';
import { header, playToggle, safeCollection, scalePicker } from './common.js';

const LABEL_MODES = [
  { value: 'name', label: 'Nombres' },
  { value: 'solfege', label: 'Do-Re-Mi' },
  { value: 'degree', label: 'Grados' },
  { value: 'none', label: 'Puntos' },
];

const POSITION_MODES = [
  { value: 'all', label: 'Todo' },
  { value: 'nps', label: 'N por cuerda' },
  { value: 'box', label: 'Caja' },
  { value: 'caged', label: 'CAGED' },
];

const RANGES = [
  { value: '0-12', label: '0–12' },
  { value: '0-15', label: '0–15' },
  { value: '0-24', label: '0–24' },
  { value: '12-24', label: '12–24' },
];

function roleOf(degree, isRoot) {
  if (isRoot) return 'root';
  if (degree === '3' || degree === '♭3') return 'third';
  if (degree === '5' || degree === '♭5' || degree === '♯5') return 'fifth';
  if (degree === '7' || degree === '♭7' || degree === '♭♭7') return 'seventh';
  return null;
}

function mount(root, ctx) {
  const { engine } = ctx;
  const session = ctx.session.get();
  const p = ctx.params;
  const state = {
    root: p.root ?? session.root,
    family: p.fam ?? session.family,
    quality: p.q ?? session.quality,
    tuning: p.tun ?? 'standard',
    from: coerce(p.from, 0),
    to: coerce(p.to, 15),
    labels: p.lab ?? 'name',
    roles: coerce(p.roles, true),
    lefty: coerce(p.lefty, false),
    mode: p.pos ?? 'all',
    posIndex: coerce(p.pi, 0),
    boxStart: coerce(p.bs, 4),
    boxSpan: coerce(p.bw, 5),
    caged: p.cg ?? 'E',
    ghost: coerce(p.ghost, true),
    vSet: coerce(p.vs, 0),
    vInv: coerce(p.vi, 'all'),
    vPick: -1,
  };
  if (state.vInv !== 'all') state.vInv = Number(state.vInv);
  let voicingList = [];
  let active = []; // notas activas actuales
  let sequence = [];
  let lastSvg = '';

  const board = h('div', { class: 'fb-wrap', id: 'fb' });
  const info = h('p', { class: 'hint', id: 'nav-info', 'aria-live': 'polite' }, 'Toca cualquier traste para oírlo.');
  const notePills = h('div', { class: 'pills' });
  const legend = h('div', { class: 'legend-row' });
  const voicingPanel = h('section', { class: 'panel', hidden: true });
  const positionControls = h('div', { class: 'stack' });
  const playBtn = playToggle({
    startLabel: '▶ Tocar escala / arpegio',
    onStart: () => playSequence(),
    onStop: () => transport.stop(),
  });
  const transport = new Transport(engine, 'navigator');
  transport.onStop = () => {
    playBtn.set(false);
    clearPlaying(board);
  };
  ctx.onCleanup(() => transport.stop());

  /* ─── Entrada MIDI: lo que tocas se ilumina en el mástil ─── */
  let midiStop = null;
  const heldMidi = new Set();
  const midiBtn = button('🎹 Entrada MIDI', { variant: 'outline', title: 'Conecta un teclado o una guitarra MIDI y mira las notas en el mástil', onClick: async () => {
    if (midiStop) { midiStop(); midiStop = null; midiBtn.textContent = '🎹 Entrada MIDI'; clearPlaying(board); return; }
    try {
      midiStop = await listenMidi({
        onNote: (midi, on) => {
          const tuning = getTuning(state.tuning).midi;
          if (on) heldMidi.add(midi); else heldMidi.delete(midi);
          for (let st = 0; st < tuning.length; st += 1) {
            const f = midi - tuning[st];
            if (f >= state.from && f <= state.to) setPlaying(board, st, f, on);
          }
          if (on) info.textContent = `MIDI: ${prettyNote(midiName(midi))} (${midiToFreq(midi).toFixed(1)} Hz)`;
        },
        onDevices: (names) => { midiBtn.textContent = names.length ? `🎹 MIDI: ${names[0]}` : '🎹 MIDI (sin dispositivos)'; },
      });
    } catch (error) {
      ctx.toast(error.message);
    }
  } });
  ctx.onCleanup(() => midiStop?.());

  const tempo = slider({ min: 40, max: 200, value: coerce(p.bpm, 110), label: 'Tempo', format: (v) => `${v}`, onInput: () => {} });
  let currentDir = 'updown';
  const dirSeg = segmented([{ value: 'up', label: '↑' }, { value: 'updown', label: '↑↓' }, { value: 'down', label: '↓' }], 'updown', (v) => { currentDir = v; });

  const picker = scalePicker({
    root: state.root,
    family: state.family,
    quality: state.quality,
    onChange: (v) => {
      Object.assign(state, v);
      ctx.session.set({ root: v.root, family: v.family, quality: v.quality });
      state.vSet = 0;
      state.vPick = -1;
      render();
    },
  });

  function currentCollection() {
    return safeCollection(state.root, state.family, state.quality);
  }

  function labelFor(note, collection) {
    if (state.labels === 'none') return '';
    if (state.labels === 'degree') return note.degree;
    if (state.labels === 'solfege') return solfege(note.pc, collection.root.prefer);
    return note.name;
  }

  /* ─── cálculo de notas activas ─── */
  function computeActive(collection, tuning) {
    const all = collectBoardNotes({ tuning, collection, fromFret: state.from, toFret: state.to });
    let activeKeys = null; // null = todas
    sequence = [];
    let message = '';
    const nps = () => ladderPerString({ tuning, collection, position: state.posIndex, maxFret: 24 });

    if (state.mode === 'nps') {
      const { ladder, partial } = nps();
      activeKeys = new Set(ladder.map((n) => `${n.s}-${n.f}`));
      sequence = ladder;
      if (partial || !ladder.length) message = 'Esta posición no cabe completa en el mástil.';
    } else if (state.mode === 'box') {
      const end = Math.min(24, state.boxStart + state.boxSpan - 1);
      activeKeys = new Set(all.filter((n) => n.f >= state.boxStart && n.f <= end).map((n) => `${n.s}-${n.f}`));
      sequence = ladderBox({ tuning, collection, startFret: state.boxStart, span: state.boxSpan }).ladder;
    } else if (state.mode === 'caged') {
      const standard = state.tuning === 'standard';
      if (!standard || state.family !== 'scale') {
        message = 'CAGED sólo está disponible para escalas en afinación estándar.';
        activeKeys = null;
      } else {
        const diagram = buildDiagram({ root: state.root, family: 'scale', quality: state.quality, shapeId: state.caged, maxFret: 15 });
        if (diagram.fingering?.notes?.length) {
          activeKeys = new Set(diagram.fingering.notes.map((n) => `${n.stringIndex}-${n.fret}`));
          sequence = diagram.fingering.notes
            .map((n) => ({ s: n.stringIndex, f: n.fret, midi: tuning[n.stringIndex] + n.fret }))
            .sort((a, b) => a.midi - b.midi)
            .filter((n, i, arr) => i === 0 || arr[i - 1].midi !== n.midi);
        } else {
          message = 'No hay una forma CAGED completa para esta tónica en 15 trastes.';
        }
      }
    }

    if (!sequence.length) {
      // Secuencia por defecto: posición que arranca en la tónica.
      const pos = rootPosition(tuning, collection);
      sequence = ladderPerString({ tuning, collection, position: pos, maxFret: 24 }).ladder;
    }
    return { all, activeKeys, message };
  }

  function draw() {
    const collection = currentCollection();
    const tuning = getTuning(state.tuning).midi;
    const { all, activeKeys, message } = computeActive(collection, tuning);
    const isChord = collection.family.id !== 'scale';
    const voicing = voicingList[state.vPick];
    const notes = [];
    for (const n of all) {
      const key = `${n.s}-${n.f}`;
      let inside = !activeKeys || activeKeys.has(key);
      if (voicing) inside = voicing.notes.some((vn) => vn.s === n.s && vn.f === n.f);
      if (!inside && !state.ghost) continue;
      const role = state.roles ? roleOf(n.degree, n.isRoot) : n.isRoot ? 'root' : null;
      notes.push({
        s: n.s,
        f: n.f,
        label: labelFor(n, collection),
        role,
        kind: inside ? 'note' : 'ghost',
        dim: !inside,
      });
    }
    active = notes.filter((n) => n.kind === 'note');
    lastSvg = renderFretboard({
      tuning,
      from: state.from,
      to: state.to,
      notes,
      lefty: state.lefty,
      title: `${collection.title}`,
    });
    board.innerHTML = lastSvg;

    // Info y píldoras
    clear(notePills);
    collection.notes.forEach((n) => {
      notePills.append(h('span', { class: `pill ${n.isRoot ? 'pill--root' : ''}`, title: `Grado ${n.degree}` }, n.name));
    });
    const degs = collection.notes.map((n) => degreeLabel(n, collection)).join(' ');
    info.textContent = message || `${collection.title} · grados: ${degs}`;
    legend.innerHTML = state.roles
      ? '<span><i style="border-color:#d84a3e"></i>Tónica</span><span><i style="border-color:#3f8f5a"></i>3ª</span><span><i style="border-color:#df812f"></i>5ª</span><span><i style="border-color:#3b73c9"></i>7ª</span>'
      : '<span><i style="border-color:#d84a3e"></i>Tónica</span>';
    if (isChord) playBtn.el.textContent = playBtn.running ? '■ Detener' : '▶ Arpegiar acorde';
    else playBtn.el.textContent = playBtn.running ? '■ Detener' : '▶ Tocar escala';
  }

  function syncUrl() {
    ctx.setParams({
      root: state.root, fam: state.family, q: state.quality, tun: state.tuning, from: state.from, to: state.to,
      lab: state.labels, roles: state.roles ? 1 : 0, lefty: state.lefty ? 1 : 0, pos: state.mode, pi: state.posIndex,
      bs: state.boxStart, bw: state.boxSpan, cg: state.caged, ghost: state.ghost ? 1 : 0, bpm: tempo.input.value,
    });
  }

  /* ─── voicings ─── */
  function buildVoicings(collection, tuning) {
    voicingList = [];
    const isChord = collection.family.id !== 'scale';
    voicingPanel.hidden = !isChord || tuning.length !== 6;
    if (voicingPanel.hidden) return;
    const pcs = collection.notes.map((n) => n.pc);
    const all = stringSetVoicings({ tuning, pcs, rootPc: collection.root.pc, maxFret: Math.min(state.to, 15) });
    const sets = [...new Set(all.map((v) => v.strings.join('-')))];
    const setKey = sets[Math.min(state.vSet, sets.length - 1)];
    voicingList = all
      .filter((v) => v.strings.join('-') === setKey && (state.vInv === 'all' || v.inversion === state.vInv))
      .slice(0, 18);
    clear(voicingPanel);
    const invCount = pcs.length;
    voicingPanel.append(
      h('h2', {}, 'Voicings e inversiones'),
      h(
        'div',
        { class: 'row' },
        select(
          sets.map((k, i) => ({ value: i, label: `Cuerdas ${k.split('-').map((s) => Number(s) + 1).join('-')}` })),
          Math.min(state.vSet, sets.length - 1),
          (v) => { state.vSet = Number(v); state.vPick = -1; render(); },
          { 'aria-label': 'Juego de cuerdas', style: 'max-width:190px' },
        ),
        segmented(
          [{ value: 'all', label: 'Todas' }, ...Array.from({ length: invCount }, (_, i) => ({ value: i, label: i === 0 ? 'Fund.' : `${i}ª inv.` }))],
          state.vInv,
          (v) => { state.vInv = v === 'all' ? 'all' : Number(v); state.vPick = -1; render(); },
        ),
      ),
    );
    const grid = h('div', { class: 'voicing-grid', style: 'margin-top:12px' });
    voicingList.forEach((v, idx) => {
      const frets = new Array(6).fill(-1);
      for (const n of v.notes) frets[5 - n.s] = n.f;
      const bassName = collection.noteByPc.get(v.bassPc)?.name ?? '';
      const card = h(
        'button',
        { type: 'button', class: `voicing-card ${state.vPick === idx ? 'is-active' : ''}`, dataset: { idx } },
        h('div', { html: renderChordBox({ frets, title: '', size: 1 }) }),
        h('div', {}, `${v.inversion === 0 ? 'Fundamental' : `${v.inversion}ª inversión`} · bajo ${bassName}`),
      );
      card.addEventListener('click', async () => {
        state.vPick = state.vPick === idx ? -1 : idx;
        await engine.ensure();
        if (state.vPick >= 0) {
          const midis = v.notes.map((n) => tuning[n.s] + n.f).sort((a, b) => a - b);
          engine.strum(midis, engine.time + 0.02, { vel: 0.75 });
        }
        render();
      });
      grid.append(card);
    });
    if (!voicingList.length) grid.append(h('p', { class: 'hint' }, 'No hay voicings con ese filtro en el rango de trastes.'));
    voicingPanel.append(grid, h('p', { class: 'hint', style: 'margin-top:8px' }, 'Pulsa un voicing para oírlo y resaltarlo en el mástil; vuelve a pulsarlo para quitar el resaltado.'));
  }

  /* ─── reproducción ─── */
  async function playSequence() {
    await engine.ensure();
    let seq = [...sequence];
    if (!seq.length) return;
    const down = [...seq].reverse();
    if (currentDir === 'down') seq = down;
    else if (currentDir === 'updown') seq = [...seq, ...down.slice(1)];
    const stepDur = () => 60 / Number(tempo.input.value) / 2;
    await transport.start({
      stepSeconds: stepDur,
      tick: (step, time) => {
        if (step >= seq.length) {
          engine.at(time + 0.2, () => transport.stop());
          return false;
        }
        const n = seq[step];
        engine.pluck(n.midi, time, { dur: stepDur() * 1.8, vel: 0.8 });
        engine.at(time, () => {
          clearPlaying(board);
          setPlaying(board, n.s, n.f, true);
        });
        return true;
      },
    });
  }
  const CHORD_TYPE_OF = {
    'triad:major': 'maj', 'triad:minor': 'm', 'triad:augmented': 'aug', 'triad:diminished': 'dim',
    'arpeggio:major7': 'maj7', 'arpeggio:minor7': 'm7', 'arpeggio:dominant7': '7',
    'arpeggio:augmented7': '7#5', 'arpeggio:diminished7': 'dim7', 'cuatriad:major7': 'maj7',
  };

  async function playChordTones() {
    await engine.ensure();
    const collection = currentCollection();
    const tuning = getTuning(state.tuning).midi;
    const voicing = voicingList[state.vPick];
    let midis;
    if (voicing) {
      midis = voicing.notes.map((n) => tuning[n.s] + n.f);
    } else {
      const typeId = CHORD_TYPE_OF[`${collection.family.id}:${collection.quality.id}`]
        ?? (collection.cagedQuality === 'minor' ? 'm' : 'maj');
      midis = guitarMidis(collection.root.pc, typeId);
    }
    engine.strum([...midis].sort((a, b) => a - b), engine.time + 0.02, { vel: 0.75, dur: 2 });
  }

  board.addEventListener('click', async (event) => {
    const hit = hitFromEvent(event);
    if (!hit) return;
    const tuning = getTuning(state.tuning).midi;
    const midi = tuning[hit.s] + hit.f;
    await engine.ensure();
    engine.pluck(midi, engine.time + 0.005, { vel: 0.85, dur: 1.6 });
    flashNote(board, hit.s, hit.f);
    info.textContent = `Cuerda ${hit.s + 1}, traste ${hit.f} → ${prettyNote(midiName(midi))} (${midiToFreq(midi).toFixed(1)} Hz)`;
  });

  /* ─── controles de posición ─── */
  function drawPositionControls(collection, tuning) {
    clear(positionControls);
    positionControls.append(
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Posición'), segmented(POSITION_MODES, state.mode, (v) => { state.mode = v; state.vPick = -1; render(); })),
    );
    if (state.mode === 'nps') {
      const count = Math.max(1, positionLabel(tuning, collection, 0).count);
      const options = Array.from({ length: count }, (_, i) => {
        const lab = positionLabel(tuning, collection, i);
        return { value: i, label: `${i + 1} · ${lab.note.name} (tr. ${lab.fret})` };
      });
      positionControls.append(
        h('div', { class: 'field' }, h('label', {}, 'Posición por nota de arranque'), select(options, Math.min(state.posIndex, count - 1), (v) => { state.posIndex = Number(v); render(); })),
        h('div', { class: 'row' }, button('Empezar en la tónica', { variant: 'ghost', onClick: () => { state.posIndex = rootPosition(tuning, collection); render(); } })),
        h('p', { class: 'hint' }, 'Tres notas por cuerda (dos en pentatónicas), de la 6ª a la 1ª.'),
      );
    } else if (state.mode === 'box') {
      positionControls.append(
        slider({ min: 0, max: 20, value: state.boxStart, label: 'Traste', onInput: (v) => { state.boxStart = v; render(); } }),
        slider({ min: 3, max: 7, value: state.boxSpan, label: 'Ancho', format: (v) => `${v} tr.`, onInput: (v) => { state.boxSpan = v; render(); } }),
      );
    } else if (state.mode === 'caged') {
      positionControls.append(
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Forma'), segmented(['C', 'A', 'G', 'E', 'D'].map((c) => ({ value: c, label: c })), state.caged, (v) => { state.caged = v; render(); })),
        h('p', { class: 'hint' }, 'Digitación CAGED del Studio (afinación estándar, 15 trastes).'),
      );
    }
  }

  function render() {
    const collection = currentCollection();
    const tuning = getTuning(state.tuning).midi;
    if (state.posIndex >= Math.max(1, positionLabel(tuning, collection, 0).count)) state.posIndex = 0;
    drawPositionControls(collection, tuning);
    buildVoicings(collection, tuning);
    draw();
    syncUrl();
    if (voicingList.length && !voicingPanel.hidden) {
      // refrescar la selección visual de tarjetas
      voicingPanel.querySelectorAll('.voicing-card').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.idx) === state.vPick));
    }
  }

  /* ─── exportar ─── */
  const savePng = button('Guardar PNG', { variant: 'outline', onClick: async () => {
    const blob = await svgToPngBlob(lastSvg, 2);
    await saveBlob(blob, `${slug(currentCollection().title)}.png`, 'Imagen PNG');
  } });
  const saveSvg = button('Guardar SVG', { variant: 'outline', onClick: async () => {
    await saveBlob(new Blob([lastSvg], { type: 'image/svg+xml' }), `${slug(currentCollection().title)}.svg`, 'Imagen SVG');
  } });

  /* ─── montaje ─── */
  const rangeSeg = segmented(RANGES, `${state.from}-${state.to}`, (v) => {
    const [a, b] = v.split('-').map(Number);
    state.from = a;
    state.to = b;
    state.vPick = -1;
    render();
  });
  const tuningSel = select(Object.values(TUNINGS).map((t) => ({ value: t.id, label: t.label })), state.tuning, (v) => {
    state.tuning = v;
    state.vPick = -1;
    render();
  });

  root.append(
    header('Aprender el mástil', 'Fretboard Navigator', 'Escalas, arpegios y acordes sobre el mástil completo: toca las notas, cambia de afinación, estudia posiciones y voicings, y comparte el enlace exacto.', saveSvg, savePng),
    h('section', { class: 'panel' },
      board,
      legend,
      h('div', { style: 'margin-top:10px' }, notePills),
      info,
      h('div', { class: 'row', style: 'margin-top:12px' }, playBtn.el, dirSeg, button('Acorde', { variant: 'outline', onClick: playChordTones }), midiBtn, h('div', { style: 'flex:1;min-width:220px' }, tempo)),
    ),
    h('div', { class: 'grid-3', style: 'margin-top:16px;align-items:start' },
      h('section', { class: 'panel stack' }, h('h2', {}, 'Qué mostrar'), picker.el,
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Etiquetas'), segmented(LABEL_MODES, state.labels, (v) => { state.labels = v; render(); })),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Mástil'),
        h('div', { class: 'field' }, h('label', {}, 'Afinación'), tuningSel),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Trastes'), rangeSeg),
        toggle('Colorear tónica, 3ª, 5ª y 7ª', state.roles, (v) => { state.roles = v; render(); }),
        toggle('Mostrar el resto atenuado', state.ghost, (v) => { state.ghost = v; render(); }),
        toggle('Modo zurdo', state.lefty, (v) => { state.lefty = v; render(); }),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Posiciones'), positionControls),
    ),
    voicingPanel,
    h('section', { class: 'panel' },
      h('h2', {}, 'Practica esto'),
      h('div', { class: 'row' },
        button('Ejercicios con tab', { onClick: () => ctx.go('exercises', { root: state.root, fam: state.family, q: state.quality }) }),
        button('Backing track', { onClick: () => ctx.go('backing', { root: state.root, mode: state.quality === 'naturalMinor' || state.quality === 'pentatonicMinor' ? 'minor' : 'major' }) }),
        button('Quiz de teoría', { onClick: () => ctx.go('quiz') }),
        button('Acordes de la tonalidad', { onClick: () => ctx.go('chords', { root: state.root }) }),
      ),
    ),
  );
  render();
}

export default {
  id: 'navigator',
  title: 'Fretboard Navigator',
  group: 'neck',
  icon: '◫',
  summary: 'Mástil de 24 trastes con audio, afinaciones, posiciones, CAGED y voicings.',
  mount,
};
