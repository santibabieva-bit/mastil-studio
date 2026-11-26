/**
 * Mástil animado: cualquier ejercicio del Lab se ve en movimiento sobre el
 * diapasón (nota actual, siguiente, estela, posición de la mano, mano
 * fantasma, púa, flechas) y se practica en cuatro modos: ver, sigue al punto,
 * eco y revelado progresivo. Incluye la comparación de digitaciones.
 */

import { TUNINGS, mod, parseRoot, prettyNote, ROOT_CHOICES } from '../core/music.js';
import { EXERCISES, EX_FAMILIES, buildExercise, cagedShapes, placeMidi } from '../core/exlib.js';
import { DRILL_LIST, buildDrill } from '../core/drills.js';
import { BUILTIN_LICKS } from '../core/licks.js';
import { guideLine } from '../core/guide.js';
import { jamPreset } from '../core/jam.js';
import { voicingsByInversion, stringSets, INVERSION_LABELS } from '../core/triads.js';
import { CHORD_TYPES, chordSymbol } from '../core/chords.js';
import { tabEvents, tabFromJson } from '../core/tab.js';
import {
  compareFingerings, revealMask, toSteps, travel, withPicking,
} from '../core/motion.js';
import { createNoteCollection } from '../core/music.js';
import { startNoteListener } from '../audio/notelisten.js';
import {
  COLORS, createAnimBoard, createPickView, createPlayer, noteName,
} from '../ui/animboard.js';
import {
  button, clear, h, segmented, select, slider, toggle,
} from '../ui/dom.js';
import { header } from './common.js';
import { availableModes, labelPicker } from '../ui/labels.js';

import { logSpot } from './neckmap.js';

const SOURCES = [
  { value: 'exlib', label: 'Biblioteca' },
  { value: 'drill', label: 'Drills' },
  { value: 'lick', label: 'Licks' },
  { value: 'guide', label: 'Voces guía' },
  { value: 'triads', label: 'Triadas' },
  { value: 'caged', label: 'CAGED' },
  { value: 'tab', label: 'Mi tab' },
];

const MODES = [
  { value: 'watch', label: '👀 Ver' },
  { value: 'follow', label: '🎯 Sigue al punto' },
  { value: 'echo', label: '🔁 Eco' },
  { value: 'reveal', label: '🫥 Revelado' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ROLE_COLOR = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, seventh: COLORS.seventh };

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const store = (k, v) => ctx.storage.set(`anim-${k}`, v);
  const load = (k, d) => ctx.storage.get(`anim-${k}`, d);
  const cfg = {
    source: ctx.params.source ?? load('source', 'exlib'),
    ex: ctx.params.ex ?? load('ex', EXERCISES[0].id),
    drill: ctx.params.drill ?? load('drill', DRILL_LIST[0].id),
    lick: load('lick', BUILTIN_LICKS[0].id),
    prog: load('prog', 'twofiveone'),
    triad: load('triad', 'maj'),
    set: load('set', 0),
    root: load('root', 'A'),
    mode: load('mode', 'watch'),
    bpm: load('bpm', 70),
    speed: load('speed', 100),
    loop: false,
    input: load('input', 'click'),
    opts: {
      next: true, trail: true, hand: true, fingers: false, pick: false, arrows: true, preview: false, click: false, labels: 'name', ...load('opts', {}),
    },
  };
  let steps = [];
  let title = '';
  let board = null;
  let player = null;
  let stopListen = null;
  const pickView = createPickView();
  const boardBox = h('div');
  const caption = h('div', { class: 'anim-caption' }, '');
  const chordEl = h('div', { class: 'anim-chord' }, '');
  const status = h('div', { class: 'feedback', hidden: true });
  const controls = h('div', { class: 'stack' });
  const sourceBox = h('div', { class: 'stack' });
  const compareBox = h('div', { class: 'stack' });
  const game = { target: 0, ok: 0, miss: 0, started: 0, phrase: null, echoIdx: 0, round: 0, active: false };

  ctx.onCleanup(() => { player?.stop(); stopListen?.(); });

  const msg = (text, kind = 'ok') => { status.hidden = !text; status.className = `feedback ${kind}`; status.textContent = text; };

  /* ───────── contenido ───────── */

  function buildSteps() {
    const rootPc = parseRoot(cfg.root)?.pc ?? 9;
    title = '';
    let list = [];
    if (cfg.source === 'exlib') {
      const built = buildExercise(cfg.ex, { tuning, root: cfg.root, quality: 'major' });
      title = built.exercise.title;
      list = withPicking(built.beats.map((b) => ({ notes: b.notes.map((n) => ({ s: n.s, f: n.f, midi: n.midi ?? tuning[n.s] + n.f, finger: n.finger })), d: 0.5 })));
    } else if (cfg.source === 'drill') {
      const built = buildDrill(cfg.drill, { tuning, root: rootPc, startFret: 5, variant: 0, quality: 'm' });
      title = built.drill.title;
      list = built.events.map((e) => ({ notes: [{ s: e.s, f: e.f, midi: tuning[e.s] + e.f, finger: e.finger, pick: e.pick, art: e.art }], d: 0.5 }));
    } else if (cfg.source === 'lick') {
      const custom = ctx.storage.get('licks-custom', []);
      const lick = [...BUILTIN_LICKS, ...custom].find((l) => l.id === cfg.lick) ?? BUILTIN_LICKS[0];
      title = lick.name;
      const sub = lick.subdivision ?? 2;
      list = toSteps(lick.notes.map((n) => [n[0], n[1], (n[2] ?? 1) / sub]), tuning);
      list = withPicking(list);
    } else if (cfg.source === 'guide') {
      const preset = jamPreset(cfg.prog);
      const chords = preset.chords.map((c) => ({ rootPc: mod(rootPc + c.s, 12), typeId: c.t }));
      const line = guideLine(chords);
      title = `Voces guía · ${preset.label}`;
      let prevMidi = 62;
      list = line.map((g, i) => {
        let midi = prevMidi - 6;
        while (mod(midi, 12) !== g.pc) midi += 1;
        prevMidi = midi;
        const spot = placeMidi(tuning, midi, 2, 15) ?? { s: 2, f: mod(midi - tuning[2], 12), midi };
        const c = chords[i];
        const chordMidis = CHORD_TYPES[c.typeId].intervals.map((iv) => 48 + mod(c.rootPc, 12) + iv);
        return {
          notes: [{ ...spot, role: g.role, glabel: g.label }],
          d: 4,
          pad: chordMidis,
          chord: chordSymbol(prettyNote(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][c.rootPc]), c.typeId),
          note: `${g.label}${g.resolves ? ' · ¡resuelve!' : ''}${g.motion != null ? ` · se mueve ${g.motion === 0 ? '0 (se queda)' : `${g.motion} semitono${g.motion > 1 ? 's' : ''}`}` : ''}`,
        };
      });
    } else if (cfg.source === 'triads') {
      const set = stringSets(tuning, 3)[cfg.set] ?? stringSets(tuning, 3)[0];
      const groups = voicingsByInversion({ tuning, rootPc, typeId: cfg.triad, set, maxFret: 15 });
      const all = Object.values(groups).flat().sort((a, b) => a.low - b.low);
      title = `Triadas ${chordSymbol(prettyNote(cfg.root), cfg.triad)} subiendo por las cuerdas ${set.map((s) => s + 1).join('-')}`;
      list = all.map((v) => {
        const midis = v.notes.map((n) => tuning[n.s] + n.f);
        return { notes: v.notes.map((n) => ({ s: n.s, f: n.f, midi: tuning[n.s] + n.f, role: roleOf(mod(tuning[n.s] + n.f - rootPc, 12)) })), d: 2, silent: true, strum: [...midis].sort((a, b) => a - b), note: INVERSION_LABELS[v.inversion] };
      });
    } else if (cfg.source === 'caged') {
      const collection = createNoteCollection(cfg.root, 'scale', 'major');
      const shapes = cagedShapes({ tuning, collection, maxFret: 17 }).filter((z) => z.octave === 0 || z.from <= 15);
      title = `CAGED conectado en ${prettyNote(cfg.root)} mayor`;
      list = shapes.map((z, i) => {
        const notes = [];
        for (let s = 0; s < 6; s += 1) {
          for (let f = z.from; f <= z.to; f += 1) {
            const pc = mod(tuning[s] + f, 12);
            if (collection.noteByPc.has(pc)) notes.push({ s, f, midi: tuning[s] + f, role: pc === collection.root.pc ? 'root' : null });
          }
        }
        const triad = notes.filter((n) => [0, 4, 7].includes(mod(n.midi - collection.root.pc, 12))).map((n) => n.midi);
        const prev = shapes[i - 1];
        const shared = prev ? Math.max(0, prev.to - z.from + 1) : 0;
        return { notes, d: 4, silent: true, strum: [...new Set(triad)].sort((a, b) => a - b).slice(0, 6), zone: z, note: `Forma de ${z.id} · trastes ${z.from}–${z.to}${shared ? ` · comparte ${shared} traste${shared > 1 ? 's' : ''} con la anterior` : ''}` };
      });
    } else if (cfg.source === 'tab') {
      const raw = ctx.storage.get('tab-current', null);
      const tab = raw ? tabFromJson(raw) : null;
      title = tab ? tab.title : '';
      if (tab) {
        const sub = tab.subdivision ?? 2;
        list = tabEvents(tab).map((ev) => ({ notes: ev.notes.filter((n) => n.fret != null || n.f != null).map((n) => { const f = n.fret ?? n.f; return { s: n.s, f, midi: tuning[n.s] + f, art: n.legato ? 'H' : null }; }), d: 1 / sub }));
        // Quita los silencios del final.
        while (list.length && !list[list.length - 1].notes.length) list.pop();
        list = withPicking(list);
      }
    }
    return list;
  }

  function roleOf(iv) {
    return { 0: 'root', 3: 'third', 4: 'third', 6: 'fifth', 7: 'fifth', 8: 'fifth', 10: 'seventh', 11: 'seventh', 9: 'seventh' }[iv] ?? null;
  }

  function colorOf(n) {
    if (cfg.source === 'guide' || cfg.source === 'triads' || cfg.source === 'caged') return ROLE_COLOR[n.role] ?? (cfg.source === 'caged' ? '#2b2a26' : COLORS.accent);
    return COLORS.accent;
  }

  // Etiquetas comunes: R 3 5 donde hay acorde (voces guía, tríadas, CAGED),
  // grado respecto a la tonalidad (todo salvo la tab libre), nota, dedo o nada.
  const tonicPc = () => parseRoot(cfg.root)?.pc ?? 9;
  const chordCtx = () => (cfg.source === 'triads' ? { rootPc: tonicPc(), typeId: cfg.triad } : cfg.source === 'caged' ? { rootPc: tonicPc(), typeId: 'maj' } : null);
  const labelPick = labelPicker({
    ctx,
    available: () => availableModes({ chord: ['guide', 'triads', 'caged'].includes(cfg.source), degree: cfg.source !== 'tab', finger: true }),
    onChange: () => player?.setOptions({ labels: labels(), tonicPc: tonicPc(), chord: chordCtx() }),
  });
  function labels() {
    const mode = labelPick.mode();
    if (mode === 'role' && cfg.source === 'guide') return (n) => n.glabel ?? '';
    return mode;
  }

  function rebuild() {
    player?.stop();
    steps = buildSteps();
    const maxF = Math.max(12, ...steps.flatMap((s) => s.notes.map((n) => n.f + 1)));
    clear(boardBox);
    board = createAnimBoard({ tuning, from: 0, to: Math.min(17, maxF), title: title || 'Mástil animado' });
    boardBox.append(board.el);
    board.el.classList.toggle('is-clickable', cfg.mode === 'follow' || cfg.mode === 'echo');
    board.onClick(onBoardClick);
    player = createPlayer(board, engine, { onStep, onEnd });
    caption.textContent = steps.length ? title : (cfg.source === 'tab' ? 'No hay tab guardada: crea una en el Tab Creator.' : 'Este contenido no cabe en el mástil.');
    chordEl.textContent = '';
    msg('');
    game.active = false;
    loadPlayer();
    if (steps.length) player.show(0);
    drawControls();
    clear(compareBox);
  }

  function loadPlayer(extra = {}) {
    // Formas completas (CAGED, triadas): la mano, los dedos y la púa no aplican.
    const shapes = cfg.source === 'caged' || cfg.source === 'triads';
    player.load(steps, {
      ...cfg.opts,
      ...(shapes ? { hand: false, fingers: false, arrows: false, pick: false, next: cfg.source === 'triads' && cfg.opts.next, trail: false } : {}),
      pickView: cfg.opts.pick && !shapes ? pickView : null,
      labels: labels(),
      tonicPc: tonicPc(),
      chord: chordCtx(),
      colorOf,
      ...extra,
    });
  }

  function onStep(i, st) {
    if (st.chord) chordEl.textContent = st.chord;
    if (st.zone) board.zones([{ from: st.zone.from, to: st.zone.to, color: '#3b73c9', label: st.zone.id }]);
    if (st.note) caption.textContent = `${title} · ${st.note}`;
    else caption.textContent = `${title} · ${i + 1}/${steps.length}`;
  }

  function onEnd() {
    playBtn.textContent = '▶ Reproducir';
    if (cfg.mode === 'reveal') afterRevealRound();
    if (cfg.mode === 'echo' && game.phrase) startEchoAnswer();
  }

  /* ───────── modos ───────── */

  const tempo = () => Math.max(20, Math.round((cfg.bpm * cfg.speed) / 100));

  async function togglePlay() {
    if (player.playing) { player.stop(); playBtn.textContent = '▶ Reproducir'; return; }
    if (cfg.mode === 'watch') {
      loadPlayer();
      playBtn.textContent = '■ Parar';
      await player.play({ tempo: tempo(), repeat: cfg.loop, countIn: 0 });
    } else if (cfg.mode === 'reveal') {
      startRevealRound();
    } else if (cfg.mode === 'echo') {
      startEcho();
    } else {
      startFollow();
    }
  }

  // Sigue al punto: la nota se anuncia y esperas a tocarla.
  async function startFollow() {
    if (!(await ensureInput())) return;
    game.target = 0;
    game.ok = 0;
    game.miss = 0;
    game.started = performance.now();
    game.active = true;
    game.askedAt = performance.now();
    loadPlayer({ next: true, trail: true });
    player.show(0, { sound: true });
    msg(cfg.input === 'click' ? 'Pulsa en el mástil la nota encendida… y tócala a la vez en tu guitarra.' : 'Toca la nota encendida.', 'ok');
  }

  function expectedNotes() {
    if (cfg.mode === 'follow') return steps[game.target]?.notes ?? [];
    if (cfg.mode === 'echo' && game.phrase) return game.phrase[game.echoIdx]?.notes ?? [];
    return [];
  }

  function answer(hit) {
    if (!game.active) return;
    const exp = expectedNotes();
    if (!exp.length) return;
    const ok = hit.midi != null
      ? exp.some((n) => n.midi === hit.midi || mod(n.midi, 12) === mod(hit.midi, 12))
      : exp.some((n) => n.s === hit.s && n.f === hit.f);
    const ms = performance.now() - (game.askedAt ?? performance.now());
    const n0 = exp[0];
    logSpot(ctx, n0.s, n0.f, ok, ms);
    if (!ok) {
      game.miss += 1;
      if (hit.s != null) board.pulse(hit.s, hit.f, COLORS.bad);
      msg(`✗ No: era ${noteName(n0.midi)} (cuerda ${n0.s + 1}, traste ${n0.f}).`, 'bad');
      return;
    }
    game.ok += 1;
    board.pulse(n0.s, n0.f, COLORS.ok);
    game.askedAt = performance.now();
    if (cfg.mode === 'follow') {
      game.target += 1;
      if (game.target >= steps.length) return finishGame();
      player.show(game.target, { sound: cfg.input === 'click' });
      msg(`✓ ${game.ok} seguidas · faltan ${steps.length - game.target}`, 'ok');
    } else {
      game.echoIdx += 1;
      // Se descubre lo acertado.
      board.dots(game.phrase.slice(0, game.echoIdx).flatMap((st) => st.notes.map((n) => ({ key: `e-${n.s}-${n.f}`, s: n.s, f: n.f, label: noteName(n.midi), fill: COLORS.ok }))));
      if (game.echoIdx >= game.phrase.length) {
        msg(`🎉 Frase repetida (${game.miss ? `${game.miss} fallo${game.miss > 1 ? 's' : ''}` : 'sin fallos'}). Otra más…`, 'ok');
        game.active = false;
        setTimeout(() => startEcho(true), 1500);
      } else msg(`✓ ${game.echoIdx}/${game.phrase.length}`, 'ok');
    }
  }

  function finishGame() {
    game.active = false;
    const secs = Math.round((performance.now() - game.started) / 1000);
    ctx.logSeconds(Math.min(secs, 900));
    msg(`🎉 Terminado: ${game.ok} aciertos y ${game.miss} fallos en ${secs} s. Cada nota se ha apuntado en tu Mapa del mástil.`, 'ok');
  }

  // Eco: mira una frase corta, desaparece y la repites.
  async function startEcho(nextChunk = false) {
    if (!(await ensureInput())) return;
    const single = steps.filter((st) => st.notes.length === 1);
    if (single.length < 3) { msg('El eco necesita una frase de notas sueltas: elige Biblioteca, Drills, Licks o Mi tab.', 'bad'); return; }
    const len = Math.min(single.length, 3 + Math.min(3, Math.floor(game.round / 2)));
    if (!nextChunk) game.round = 0;
    game.round += 1;
    const start = Math.floor(Math.random() * Math.max(1, single.length - len));
    game.phrase = single.slice(start, start + len).map((st) => ({ ...st, d: Math.max(0.5, st.d) }));
    game.echoIdx = 0;
    game.miss = 0;
    game.active = false;
    player.load(game.phrase, { next: false, trail: true, hand: cfg.opts.hand, arrows: true, labels: 'name', colorOf });
    msg(`Mira y escucha la frase de ${len} notas…`, 'ok');
    playBtn.textContent = '■ Parar';
    await player.play({ tempo: Math.min(tempo(), 90) });
  }

  function startEchoAnswer() {
    board.clear('notes');
    board.clearArrows();
    board.hand(null);
    game.active = true;
    game.askedAt = performance.now();
    msg('Ahora tú: repítela nota a nota (en el mástil o en tu guitarra).', 'ok');
  }

  // Revelado progresivo: en cada ronda se ven menos notas.
  const ROUNDS = 4;
  async function startRevealRound() {
    if (!steps.length) return;
    const mask = revealMask(steps.length, game.round, ROUNDS);
    loadPlayer({ mask, next: game.round === 0 && cfg.opts.next });
    const hidden = mask.filter((v) => !v).length;
    msg(game.round === 0 ? 'Ronda 1: todo a la vista. Tócalo a la vez.' : game.round >= ROUNDS - 1 ? 'Última ronda: de memoria. Solo suena el audio.' : `Ronda ${game.round + 1}: ${hidden} notas ocultas. Recuérdalas.`, 'ok');
    playBtn.textContent = '■ Parar';
    await player.play({ tempo: tempo(), countIn: 4 });
  }

  function afterRevealRound() {
    if (game.round >= ROUNDS - 1) {
      msg('🎉 Lo has tocado de memoria. Repite la última ronda hasta que salga sin dudas.', 'ok');
      game.round = ROUNDS - 1;
    } else {
      game.round += 1;
      msg(`Ronda superada. Pulsa ▶ para la ronda ${game.round + 1} de ${ROUNDS} (con menos ayuda).`, 'ok');
    }
    drawControls();
  }

  async function ensureInput() {
    if (cfg.input === 'click' || stopListen) return true;
    try {
      stopListen = await startNoteListener(engine, { source: cfg.input, onNote: (midi) => answer({ midi }), isArmed: () => game.active });
      return true;
    } catch (e) {
      msg(cfg.input === 'mic' ? 'No he podido usar el micrófono. Elige «Clic».' : e.message, 'bad');
      return false;
    }
  }

  function onBoardClick(hit) {
    if (cfg.mode === 'follow' || cfg.mode === 'echo') {
      engine.ensure().then(() => engine.pluck(tuning[hit.s] + hit.f, engine.time + 0.01, { dur: 0.7 }));
      answer(hit);
    }
  }

  /* ───────── comparar digitaciones ───────── */

  function showCompare() {
    clear(compareBox);
    const single = steps.filter((st) => st.notes.length === 1).slice(0, 24);
    const variants = compareFingerings(single, tuning);
    if (variants.length < 2) { compareBox.append(h('p', { class: 'hint' }, 'No hay dos digitaciones distintas para esta frase.')); return; }
    const names = { position: 'Por posición (la mano casi no se mueve)', string: 'Por cuerda (en horizontal)' };
    const orig = travel(single);
    const players = [];
    compareBox.append(h('h2', {}, 'Comparar digitaciones'), h('p', { class: 'hint' }, `La original mueve la mano ${plural(orig.frets, 'traste')} con ${plural(orig.shifts, 'cambio')} de posición. Mira cómo cambia el recorrido.`));
    variants.forEach((v, k) => {
      const b = createAnimBoard({ tuning, from: 0, to: Math.min(17, Math.max(12, ...v.steps.map((s) => s.notes[0].f + 1))) });
      const p = createPlayer(b, engine);
      p.load(v.steps, { next: true, trail: true, hand: true, arrows: true, fingers: false, labels: 'finger', mute: k > 0 });
      p.show(0);
      players.push(p);
      compareBox.append(h('div', { class: 'stack' },
        h('strong', {}, `${names[v.strategy]} · ${plural(v.travel.frets, 'traste')} de recorrido, ${plural(v.travel.shifts, 'cambio')} de posición, ${plural(v.travel.strings, 'salto')} de cuerda`),
        b.el));
    });
    compareBox.append(h('div', { class: 'row' },
      button('▶ Reproducir las dos a la vez', { variant: 'accent', onClick: () => players.forEach((p) => p.play({ tempo: tempo() })) }),
      button('■ Parar', { variant: 'outline', onClick: () => players.forEach((p) => p.stop()) })));
    compareBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ───────── controles ───────── */

  const playBtn = button('▶ Reproducir', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: togglePlay });

  function drawSource() {
    clear(sourceBox);
    const rootSel = h('div', { class: 'field' }, h('label', {}, 'Tonalidad'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; store('root', v); rebuild(); }));
    const parts = [h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Contenido'), segmented(SOURCES, cfg.source, (v) => { cfg.source = v; store('source', v); drawSource(); rebuild(); }))];
    if (cfg.source === 'exlib') {
      const opts = EX_FAMILIES.flatMap((fam) => EXERCISES.filter((e) => e.family === fam.id).map((e) => ({ value: e.id, label: `${fam.label} · ${e.title}` })));
      parts.push(h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', {}, 'Ejercicio'), select(opts, cfg.ex, (v) => { cfg.ex = v; store('ex', v); rebuild(); })), rootSel));
    } else if (cfg.source === 'drill') {
      parts.push(h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', {}, 'Drill'), select(DRILL_LIST.map((d) => ({ value: d.id, label: d.title })), cfg.drill, (v) => { cfg.drill = v; store('drill', v); rebuild(); })), rootSel));
    } else if (cfg.source === 'lick') {
      const custom = ctx.storage.get('licks-custom', []);
      parts.push(h('div', { class: 'field' }, h('label', {}, 'Lick'), select([...BUILTIN_LICKS, ...custom].map((l) => ({ value: l.id, label: l.name })), cfg.lick, (v) => { cfg.lick = v; store('lick', v); rebuild(); })));
    } else if (cfg.source === 'guide') {
      const progs = ['twofiveone', 'minortwofive', 'blues12', 'bossa', 'reh-tritone', 'reh-chain', 'pop4'].map((id) => jamPreset(id)).map((p) => ({ value: p.id, label: p.label }));
      parts.push(h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', {}, 'Progresión'), select(progs, cfg.prog, (v) => { cfg.prog = v; store('prog', v); rebuild(); })), rootSel));
    } else if (cfg.source === 'triads') {
      const sets = stringSets(tuning, 3).map((set, i) => ({ value: i, label: `Cuerdas ${set.map((s) => s + 1).join('-')}` }));
      parts.push(h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Tríada'), select([{ value: 'maj', label: 'Mayor' }, { value: 'm', label: 'Menor' }, { value: 'dim', label: 'Disminuida' }, { value: 'aug', label: 'Aumentada' }], cfg.triad, (v) => { cfg.triad = v; store('triad', v); rebuild(); })),
        h('div', { class: 'field' }, h('label', {}, 'Juego de cuerdas'), select(sets, cfg.set, (v) => { cfg.set = Number(v); store('set', cfg.set); rebuild(); })),
        rootSel));
    } else if (cfg.source === 'caged') {
      parts.push(rootSel);
    } else if (cfg.source === 'tab') {
      parts.push(h('p', { class: 'hint' }, 'Usa la tab abierta en el Tab Creator. Con «Película» activada verás la forma del compás siguiente antes de llegar.'), button('Abrir el Tab Creator', { variant: 'ghost', onClick: () => ctx.go('tab') }));
    }
    sourceBox.append(...parts);
  }

  function opt(label, key) {
    return toggle(label, !!cfg.opts[key], (v) => {
      cfg.opts[key] = v;
      store('opts', cfg.opts);
      const shapes = cfg.source === 'caged' || cfg.source === 'triads';
      if (!(shapes && ['hand', 'fingers', 'arrows', 'pick', 'trail'].includes(key))) player?.setOptions({ [key]: v, pickView: cfg.opts.pick && !shapes ? pickView : null });
      if (key === 'hand' && !v) board.hand(null);
      if (key === 'fingers' && !v) board.fingers(null);
      if (key === 'arrows' && !v) board.clearArrows();
      if (key === 'preview' && !v) board.clear('preview');
      pickView.el.hidden = !cfg.opts.pick;
    });
  }

  function drawControls() {
    clear(controls);
    const step = (d) => { player.stop(); player.show((player.index < 0 ? 0 : player.index) + d, { sound: true }); };
    controls.append(...[
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Modo'), segmented(MODES, cfg.mode, (v) => { cfg.mode = v; store('mode', v); game.round = 0; game.active = false; msg(''); board.el.classList.toggle('is-clickable', v === 'follow' || v === 'echo'); drawControls(); })),
      cfg.mode === 'follow' || cfg.mode === 'echo'
        ? h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Respondes con'), segmented([{ value: 'click', label: 'Clic en el mástil' }, { value: 'mic', label: 'Micrófono' }, { value: 'midi', label: 'Guitarra MIDI' }], cfg.input, (v) => { cfg.input = v; store('input', v); stopListen?.(); stopListen = null; }))
        : null,
      h('div', { class: 'anim-controls' },
        button('⏮', { variant: 'ghost', title: 'Paso anterior', onClick: () => step(-1) }),
        playBtn,
        button('⏭', { variant: 'ghost', title: 'Paso siguiente', onClick: () => step(1) }),
        cfg.mode === 'watch' ? toggle('Bucle', cfg.loop, (v) => { cfg.loop = v; }) : null,
        cfg.mode === 'reveal' ? h('span', { class: 'pill' }, `Ronda ${game.round + 1}/${ROUNDS}`) : null,
        cfg.mode === 'reveal' && game.round > 0 ? button('↺ Desde el principio', { variant: 'ghost', onClick: () => { game.round = 0; drawControls(); msg(''); } }) : null,
      ),
      h('div', { class: 'grid-2' },
        slider({ min: 40, max: 200, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; store('bpm', v); player.setTempo(tempo()); } }),
        slider({ min: 25, max: 100, step: 5, value: cfg.speed, label: 'Velocidad', format: (v) => `${v} %`, onInput: (v) => { cfg.speed = v; store('speed', v); player.setTempo(tempo()); } }),
      ),
    ].filter(Boolean));
  }

  const optionsPanel = h('section', { class: 'panel stack' },
    h('h2', {}, 'Qué se ve'),
    opt('Siguiente nota (en fantasma)', 'next'),
    opt('Estela de las notas tocadas', 'trail'),
    opt('Posición de la mano', 'hand'),
    opt('Mano fantasma (los 4 dedos)', 'fingers'),
    opt('Púa en cámara lenta', 'pick'),
    opt('Flechas de movimiento', 'arrows'),
    opt('Película: la forma del compás siguiente', 'preview'),
    opt('Clic de metrónomo', 'click'),
    (labelPick.refresh(), labelPick.el),
    button('⚖ Comparar digitaciones', { variant: 'outline', onClick: showCompare }),
    h('p', { class: 'hint' }, 'Consejo: empieza al 50 % con todo a la vista, luego quita ayudas una a una. La meta es tocarlo sin mirar.'),
  );
  pickView.el.hidden = !cfg.opts.pick;

  root.append(
    header('Aprender el mástil', 'Mástil animado', 'Los ejercicios en movimiento: ves qué nota viene, qué dedo pisa, cuándo se mueve la mano y hacia dónde va la púa. Después practícalo siguiendo el punto, repitiendo de memoria (eco) o con la ayuda retirándose ronda a ronda.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, sourceBox),
        h('section', { class: 'panel stack' }, chordEl, boardBox, caption, pickView.el, controls, status),
        compareBox,
      ),
      optionsPanel,
    ),
  );
  drawSource();
  rebuild();
}

export default {
  id: 'animneck',
  title: 'Mástil animado',
  group: 'neck',
  icon: '🎬',
  summary: 'Ejercicios en movimiento: siguiente nota, mano, dedos, púa y flechas; modos sigue al punto, eco y revelado.',
  isNew: true,
  mount,
};
