/** Biblioteca de ejercicios de digitación: permutaciones, secuencias, intervalos, dobles cuerdas… con partitura y tab de alphaTab. */

import {
  PERMUTATION3_NAMES, PERMUTATION_NAMES, DIRECTIONS, EXERCISES, EX_FAMILIES, availablePairs, buildExercise, exerciseById,
  exercisesByFamily, fingeringLine, stringPairLabel, cagedShapes, cagedPairs, cagedBoard, CAGED_COLORS, CAGED_ORDER,
} from '../core/exlib.js';
import { INSTRUMENTS, beatsToAlphaTex } from '../core/alphatex.js';
import { positionLabel, rootPosition } from '../core/exercises.js';
import { TUNINGS, getTuning } from '../core/music.js';
import { tabFromSequence, tabToJson } from '../core/tab.js';
import { coerce } from '../core/state.js';
import { createLiveBoard } from '../ui/liveboard.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import {
  button, clear, copyText, h, segmented, select, slider, toggle,
} from '../ui/dom.js';
import { header, qualityChoices, rootChoices } from './common.js';

const NOTE_VALUES = [
  { value: '4', label: 'Negras' },
  { value: '8', label: 'Corcheas' },
  { value: '16', label: 'Semicorcheas' },
  { value: '8t', label: 'Tresillos' },
];

const CHORDS = [
  { value: 'maj', label: 'Mayor' }, { value: 'm', label: 'Menor' }, { value: '7', label: 'Dominante 7' },
  { value: 'maj7', label: 'Mayor 7' }, { value: 'm7', label: 'Menor 7' }, { value: 'm7b5', label: 'Semidisminuido' },
  { value: 'dim7', label: 'Disminuido 7' },
];

function mount(root, ctx) {
  const p = ctx.params;
  const sess = ctx.session.get();
  const st = {
    ex: p.ex ?? ctx.storage.get('exlib-ex', 'perm-scale-4'),
    root: p.root ?? sess.root ?? 'A',
    quality: p.q ?? 'major',
    pent: p.pent ?? 'minor',
    tuning: p.tun ?? 'standard',
    position: coerce(p.pos, -1),
    direction: p.dir ?? 'up',
    perm: coerce(p.perm, 0),
    perm3: coerce(p.perm3, 0),
    variant: coerce(p.var, 0),
    startFret: coerce(p.fr, 5),
    string: coerce(p.str, 1),
    pair: p.pair ? p.pair.split('-').map(Number) : null,
    harmonic: coerce(p.harm, true),
    shape: p.cg ?? 'all',
    cagedPair: p.cpair === 'all' ? 'all' : p.cpair ? p.cpair.split('-').map(Number) : null,
    chord: p.chord ?? 'm7',
    arpPos: coerce(p.ap, 0),
    value: p.nv ?? '8',
    tempo: coerce(p.bpm, 70),
    fingers: coerce(p.fing, true),
    instrument: p.inst ?? 'clean',
    family: null,
  };
  st.family = exerciseById(st.ex).family;

  const stageScore = h('div');
  const board = h('div', { class: 'fb-wrap' });
  const live = createLiveBoard(board);
  const infoBox = h('div', { class: 'stack' });
  const navBox = h('div', { class: 'row no-print caged-nav' });
  const legendBox = h('div', { class: 'row caged-legend' });
  let activeRow = null;
  const listBox = h('div', { class: 'ex-list', role: 'listbox', 'aria-label': 'Ejercicios' });
  const paramBox = h('div', { class: 'stack' });
  const score = createScore(stageScore, {
    fingers: st.fingers,
    onPlaying: (on) => { ctx.engine.notePlaying('exlib', on); if (!on) live.cursor(null); },
    // mientras suena, el mástil marca el par que toca en cada momento
    onBeat: (beat) => {
      if (!built) return;
      const idx = score.state.beats.indexOf(beat);
      // Aro que sigue a las notas que suenan.
      live.cursor(null);
      for (const n of built.beats[idx]?.notes ?? []) live.cursor(n.s, n.f, true);
      if (!built.beatRow) return;
      const row = built.beatRow[idx];
      if (row != null && row !== activeRow) { activeRow = row; drawBoard(); updateNav(); }
    },
  });
  ctx.onCleanup(() => score.destroy());

  let built = null;
  let tex = '';
  let timer = 0;
  ctx.onCleanup(() => clearTimeout(timer));

  const tuningMidi = () => getTuning(st.tuning).midi;

  function build() {
    const ex = exerciseById(st.ex);
    built = buildExercise(st.ex, {
      tuning: tuningMidi(), root: st.root, quality: st.quality, pent: st.pent, position: st.position, direction: st.direction,
      perm: st.perm, perm3: st.perm3, variant: st.variant, startFret: st.startFret, string: st.string, pair: st.pair,
      harmonic: st.harmonic, chord: st.chord, arpPos: st.arpPos, shape: st.shape, cagedPair: cagedPairNow(ex),
    });
    const tuplet = st.value === '8t';
    const duration = tuplet ? 8 : Number(st.value);
    const bass = tuningMidi().length <= 5 && tuningMidi()[0] < 50;
    const instrument = bass ? INSTRUMENTS.bass.id : INSTRUMENTS[st.instrument].id;
    tex = beatsToAlphaTex(built.beats, {
      title: ex.title,
      subtitle: ex.noScale ? '' : `${built.collection.title}`,
      tempo: st.tempo,
      tuning: tuningMidi(),
      instrument,
      duration,
      tuplet,
      showFingers: st.fingers,
    });
    return ex;
  }

  /** Par de cuerdas del ejercicio CAGED: el elegido, o uno por defecto (3.ª-2.ª terceras, 4.ª-2.ª sextas); null = todos. */
  function cagedPairNow(ex) {
    if (!ex.cagedParams || st.cagedPair === 'all') return null;
    const pairs = cagedPairs(tuningMidi().length);
    const want = st.cagedPair ?? (ex.k === 2 ? [2, 1] : [3, 1]);
    return pairs.find((q) => q[0] === want[0] && q[1] === want[1]) ?? pairs[0];
  }

  /** Mástil con todas las notas de la escala por zonas CAGED (atenuadas) y el par activo resaltado. */
  function drawCagedBoard() {
    const tuning = tuningMidi();
    const { notes, shapes } = cagedBoard({ tuning, collection: built.collection, maxFret: 17 });
    const rows = built.rows ?? [];
    const row = activeRow != null ? rows[activeRow] : null;
    const hot = new Map();
    if (row) for (const n of [row.low, row.high]) hot.set(`${n.s}-${n.f}`, n);
    const fingerOf = new Map();
    for (const b of built.beats) for (const n of b.notes) fingerOf.set(`${n.s}-${n.f}`, n.finger);
    const focus = st.shape !== 'all' ? st.shape : null;
    live.render({
      tuning, from: 0, to: 17,
      notes: notes.map((n) => {
        const key = `${n.s}-${n.f}`;
        const isHot = hot.has(key);
        const inFocus = !focus || n.zones.includes(focus);
        return {
          s: n.s, f: n.f, kind: isHot ? 'select' : 'note',
          label: isHot && st.fingers && fingerOf.get(key) ? String(fingerOf.get(key)) : n.name,
          colors: n.zones.length ? n.zones.map((z) => CAGED_COLORS[z]) : ['#8a8272'],
          ring: isHot ? '#17231e' : null,
          alpha: isHot ? 1 : row ? (inFocus ? 0.4 : 0.16) : (inFocus ? 0.55 : 0.2),
          role: n.isRoot && !isHot ? 'root' : null,
        };
      }),
      title: exerciseById(st.ex).title,
    });
    clear(legendBox);
    for (const id of CAGED_ORDER) {
      const spans = shapes.filter((z) => z.id === id).map((z) => `${z.from}-${z.to}`).join(' y ');
      legendBox.append(h('span', { class: 'chip caged-chip', style: `border-left:10px solid ${CAGED_COLORS[id]}` }, `Forma ${id} · trastes ${spans}`));
    }
    legendBox.append(h('span', { class: 'hint' }, 'Donde las zonas se solapan, la nota lleva varios colores. Aro rojo = tónica.'));
  }

  function updateNav() {
    clear(navBox);
    const rows = built?.rows;
    if (!rows?.length) return;
    const i = activeRow ?? 0;
    const r = rows[i];
    const pair = r ? `cuerdas ${r.low.s + 1}-${r.high.s + 1}, trastes ${r.low.f} y ${r.high.f}` : '';
    const go = (to) => {
      activeRow = (to + rows.length) % rows.length;
      drawBoard();
      updateNav();
      score.seekBeat(built.beatRow.indexOf(activeRow));
    };
    navBox.append(
      button('◀ Par anterior', { variant: 'outline', onClick: () => go(i - 1) }),
      button('Par siguiente ▶', { variant: 'outline', onClick: () => go(i + 1) }),
      h('span', { class: 'hint' }, `Par ${i + 1} de ${rows.length} · ${pair}`),
    );
  }

  function drawBoard() {
    if (exerciseById(st.ex).cagedParams && built.rows?.length) { drawCagedBoard(); return; }
    clear(legendBox);
    const tuning = tuningMidi();
    const notes = built.notes;
    if (!notes.length) { board.replaceChildren(); return; }
    const frets = notes.map((n) => n.f);
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    const from = lo <= 2 ? 0 : Math.max(1, lo - 1);
    const to = Math.min(24, Math.max(hi + 1, from + 5));
    const fingerOf = new Map();
    for (const b of built.beats) for (const n of b.notes) fingerOf.set(`${n.s}-${n.f}`, n.finger);
    const rootPc = built.collection.root.pc;
    live.render({
      tuning, from, to,
      notes: notes.map((n) => ({
        s: n.s, f: n.f, label: st.fingers && fingerOf.get(`${n.s}-${n.f}`) ? String(fingerOf.get(`${n.s}-${n.f}`)) : '',
        role: (tuning[n.s] + n.f) % 12 === rootPc && !exerciseById(st.ex).noScale ? 'root' : null,
      })),
      title: exerciseById(st.ex).title,
    });
  }

  function drawInfo(ex) {
    clear(infoBox);
    const fam = EX_FAMILIES.find((f) => f.id === ex.family);
    infoBox.append(...[
      h('div', { class: 'kicker' }, fam?.label ?? ''),
      h('h2', { style: 'margin:0' }, ex.title),
      h('p', {}, ex.desc),
      h('p', { class: 'hint' }, `💡 ${ex.tip}`),
      built.warnings.length ? h('p', { class: 'feedback bad' }, built.warnings.join(' ')) : null,
      h('p', { class: 'hint' }, `${built.noteCount} notas · ${built.beats.length} ${built.beats.length === 1 ? 'tiempo' : 'tiempos'}`),
      st.fingers && built.beats.length ? h('details', { class: 'syntax' }, h('summary', {}, 'Digitación sugerida (dedos 1-4, 0 = al aire)'), h('pre', { class: 'ex-notes' }, fingeringLine(built.beats.slice(0, 96)))) : null,
    ].filter(Boolean));
  }

  function drawList() {
    clear(listBox);
    for (const ex of exercisesByFamily(st.family)) {
      const btn = h('button', { type: 'button', class: `ex-item ${ex.id === st.ex ? 'is-active' : ''}`, role: 'option', 'aria-selected': String(ex.id === st.ex) }, ex.title);
      btn.addEventListener('click', () => {
        st.ex = ex.id;
        st.pair = null;
        st.position = -1;
        ctx.storage.set('exlib-ex', ex.id);
        refresh(true);
      });
      listBox.append(btn);
    }
  }

  function drawParams(ex) {
    clear(paramBox);
    const tuning = tuningMidi();
    const params = new Set(ex.params ?? []);
    const collection = ex.noScale ? null : built.collection;
    const f = (label, control) => h('div', { class: 'field' }, h('label', {}, label), control);
    const row = [];
    row.push(h('div', { class: 'grid-2' }, f('Tónica', select(rootChoices(), st.root, (v) => { st.root = v; ctx.session.set({ root: v }); st.pair = null; st.position = -1; refresh(); })),
      ex.noScale || ex.family === 'pent' || ex.family === 'arp'
        ? (ex.family === 'pent'
          ? f('Escala', select([{ value: 'minor', label: 'Pentatónica menor' }, { value: 'major', label: 'Pentatónica mayor' }, { value: 'blues', label: 'Blues' }], st.pent, (v) => { st.pent = v; st.position = -1; refresh(); }))
          : ex.family === 'arp' ? f('Acorde', select(CHORDS, st.chord, (v) => { st.chord = v; st.arpPos = 0; refresh(); })) : h('div'))
        : f('Escala', select(qualityChoices('scale'), st.quality, (v) => { st.quality = v; st.position = -1; st.pair = null; refresh(); }))));
    if (ex.needsPosition && collection) {
      const count = positionLabel(tuning, collection, 0).count;
      const current = st.position < 0 ? rootPosition(tuning, collection) : st.position;
      row.push(f('Posición (nota de arranque en la cuerda grave)', select(
        Array.from({ length: count }, (_, i) => { const l = positionLabel(tuning, collection, i); return { value: i, label: `${i + 1} · ${l.note.name} (traste ${l.fret})` }; }),
        current, (v) => { st.position = Number(v); refresh(); },
      )));
    }
    if (params.has('perm')) row.push(f('Permutación de dedos', select(PERMUTATION_NAMES.map((n, i) => ({ value: i, label: n })), st.perm, (v) => { st.perm = Number(v); refresh(); })));
    if (params.has('perm3')) row.push(f('Permutación de 3 notas', select(PERMUTATION3_NAMES.map((n, i) => ({ value: i, label: n })), st.perm3, (v) => { st.perm3 = Number(v); refresh(); })));
    if (params.has('variant')) row.push(f('Variante', segmented([{ value: 0, label: 'Subiendo' }, { value: 1, label: 'Invertido' }, { value: 2, label: 'Zigzag' }], st.variant, (v) => { st.variant = Number(v); refresh(); })));
    if (params.has('startFret')) row.push(slider({ min: 0, max: 17, value: st.startFret, label: ex.family === 'double' ? 'Desde' : 'Traste', format: (v) => `${v}`, onInput: (v) => { st.startFret = v; scheduleRefresh(); } }));
    if (params.has('string')) row.push(f('Cuerda', select(tuning.map((_, i) => ({ value: i, label: `${i + 1}ª cuerda` })), st.string, (v) => { st.string = Number(v); refresh(); })));
    if (params.has('cagedShape') && collection) {
      const shapes = cagedShapes({ tuning, collection });
      const opts = [{ value: 'all', label: 'Las 5 formas encadenadas' },
        ...CAGED_ORDER.map((id) => ({ value: id, label: `Forma ${id} · trastes ${shapes.filter((s) => s.id === id).map((s) => `${s.from}-${s.to}`).join(' y ')}` }))];
      if (!opts.some((o) => o.value === st.shape)) st.shape = 'all';
      row.push(f('Forma CAGED', select(opts, st.shape, (v) => { st.shape = v; refresh(); })));
      const pairs = cagedPairs(tuning.length);
      const pairOpts = [{ value: 'all', label: 'Todos los pares (uno tras otro)' }, ...pairs.map((q) => ({ value: q.join('-'), label: stringPairLabel(q) }))];
      row.push(f('Par de cuerdas', select(pairOpts, cagedPairNow(ex) ? cagedPairNow(ex).join('-') : 'all', (v) => { st.cagedPair = v === 'all' ? 'all' : v.split('-').map(Number); activeRow = 0; refresh(); })));
    }
    if (params.has('pair') && collection) {
      const pairs = availablePairs({ tuning, collection, k: ex.k });
      const current = st.pair && pairs.some((q) => q[0] === st.pair[0] && q[1] === st.pair[1]) ? st.pair : pairs[0];
      st.pair = current ?? null;
      row.push(f('Par de cuerdas', select(pairs.map((q) => ({ value: q.join('-'), label: stringPairLabel(q) })), current ? current.join('-') : '', (v) => { st.pair = v.split('-').map(Number); refresh(); })));
    }
    if (params.has('harmonic')) row.push(toggle('Las dos notas a la vez (apagado = arpegiadas)', st.harmonic, (v) => { st.harmonic = v; refresh(); }));
    if (params.has('arpPos') && built.exercise && ex.family === 'arp') row.push(slider({ min: 0, max: 8, value: st.arpPos, label: 'Posición', format: (v) => `${v + 1}`, onInput: (v) => { st.arpPos = v; scheduleRefresh(); } }));
    row.push(f('Dirección', segmented(DIRECTIONS, st.direction, (v) => { st.direction = v; refresh(); })));
    row.push(f('Afinación', select(Object.values(TUNINGS).filter((t) => t.midi.length >= 4 && t.id !== 'ukulele').map((t) => ({ value: t.id, label: t.label })), st.tuning, (v) => { st.tuning = v; st.position = -1; st.pair = null; refresh(); })));
    paramBox.append(...row);
  }

  function drawPlayback() {
    return h('section', { class: 'panel stack' },
      h('h2', {}, 'Cómo se toca'),
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Figura'), segmented(NOTE_VALUES, st.value, (v) => { st.value = v; refresh(); })),
      slider({ min: 40, max: 200, value: st.tempo, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { st.tempo = v; scheduleRefresh(); } }),
      toggle('Mostrar los dedos (1-4)', st.fingers, (v) => { st.fingers = v; score.setFingers(v); refresh(); }),
      h('div', { class: 'field' }, h('label', {}, 'Sonido'), select(Object.entries(INSTRUMENTS).filter(([k]) => k !== 'bass').map(([value, i]) => ({ value, label: i.label })), st.instrument, (v) => { st.instrument = v; refresh(); })),
    );
  }

  function syncUrl() {
    ctx.setParams({
      ex: st.ex, root: st.root, q: st.quality, pent: st.pent, tun: st.tuning, pos: st.position, dir: st.direction, perm: st.perm,
      perm3: st.perm3, var: st.variant, fr: st.startFret, str: st.string, pair: st.pair?.join('-'), harm: st.harmonic ? 1 : 0, cg: st.shape, cpair: st.cagedPair === 'all' ? 'all' : st.cagedPair?.join('-'),
      chord: st.chord, ap: st.arpPos, nv: st.value, bpm: st.tempo, fing: st.fingers ? 1 : 0, inst: st.instrument,
    });
  }

  function refresh(full = false) {
    const ex = build();
    st.family = ex.family;
    activeRow = built.rows?.length ? Math.min(activeRow ?? 0, built.rows.length - 1) : null;
    drawBoard();
    updateNav();
    drawInfo(ex);
    if (full || !paramBox.children.length) { drawFamilies(); drawList(); }
    drawParams(ex);
    // el par puede haberse fijado al dibujar los parámetros
    if (ex.family === 'double' && st.pair) { build(); drawBoard(); }
    score.load(tex);
    syncUrl();
  }
  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(), 220);
  }

  const familyBox = h('div');
  function drawFamilies() {
    clear(familyBox);
    familyBox.append(segmented(EX_FAMILIES.map((f) => ({ value: f.id, label: f.label })), st.family, (v) => {
      st.family = v;
      st.ex = exercisesByFamily(v)[0].id;
      st.pair = null;
      st.position = -1;
      ctx.storage.set('exlib-ex', st.ex);
      refresh(true);
    }));
  }

  const toTab = () => {
    const seq = built.beats.flatMap((b) => b.notes).map((n) => ({ s: n.s, f: n.f }));
    const tab = tabFromSequence(seq, { strings: tuningMidi().length, title: exerciseById(st.ex).title, tempo: st.tempo });
    tab.subdivision = st.value === '4' ? 1 : st.value === '16' ? 4 : 2;
    ctx.storage.set('tab-handoff', tabToJson(tab));
    ctx.go('tab', { handoff: 1 });
  };

  root.append(
    header('Practicar', 'Biblioteca de ejercicios', `${EXERCISES.length} ejercicios de digitación y técnica: permutaciones de dedos, secuencias de escala y pentatónica, intervalos, terceras y sextas en dobles cuerdas, arpegios y legato. Todo se genera en la tonalidad, posición y afinación que elijas y se pinta como partitura y tablatura que puedes tocar.`),
    h('div', { class: 'tool-grid' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, h('h2', {}, 'Ejercicio'), familyBox, listBox),
        h('section', { class: 'panel stack' }, h('h2', {}, 'Ajustes'), paramBox),
        drawPlayback(),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, infoBox, navBox, board, legendBox),
        h('section', { class: 'panel stack' },
          scoreToolbar(score, { layout: false, extra: [
            button('Abrir en Tab Creator', { variant: 'outline', onClick: toTab }),
            button('Editar alphaTex', { variant: 'dark', onClick: () => { ctx.storage.set('score-handoff', tex); ctx.go('score', { handoff: 1 }); } }),
            button('Copiar alphaTex', { variant: 'outline', onClick: async () => ctx.toast((await copyText(tex)) ? 'alphaTex copiado' : 'No se pudo copiar') }),
            button('Imprimir / PDF', { variant: 'outline', onClick: () => window.print() }),
          ] }),
          stageScore,
        ),
      ),
    ),
  );
  refresh(true);
}

export default {
  id: 'exlib',
  title: 'Biblioteca de ejercicios',
  group: 'practice',
  icon: '𝄢',
  summary: 'Permutaciones, secuencias, terceras y sextas, legato y más, con partitura y tab que suenan.',
  isNew: true,
  mount,
};
