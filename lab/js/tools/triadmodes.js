/**
 * Modos interactivos de «Tríadas en movimiento»: reacción a tempo, las 12
 * formas en 60 segundos, dictado de progresiones e improvisación puntuada,
 * y el mapa de las 48 combinaciones (calidad × inversión × grupo).
 */

import { prettyNote } from '../core/music.js';
import {
  INVERSION_LABELS, QUALITIES, QUALITY_LABEL, ROLE_LABEL, SETS, chordName, chordStep, checkDrill, diatonic, drillQuestion,
  recordDrill, setName,
} from '../core/triadex.js';
import { allForms, dictationQuestion, judgeImprovNote, matchForm } from '../core/triadmore.js';
import { heatColor, mastery } from '../core/heatmap.js';
import { startNoteListener } from '../audio/notelisten.js';
import { COLORS, noteName } from '../ui/animboard.js';
import { button, h, segmented, toggle } from '../ui/dom.js';

const ROLE_COLOR = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, other: COLORS.note };
const ROMANS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

/** Mapa de las 48 combinaciones: filas = grupo de cuerdas, columnas = calidad × inversión. */
export function triadHeatmap(stats) {
  const grid = h('div', { class: 'triad-heat', role: 'table', 'aria-label': 'Dominio de las 48 formas' });
  grid.append(h('span', {}));
  for (const q of QUALITIES) grid.append(h('span', { class: 'hint triad-heat-head', style: 'grid-column: span 3' }, QUALITY_LABEL[q]));
  grid.append(h('span', {}));
  for (let k = 0; k < 12; k += 1) grid.append(h('span', { class: 'hint triad-heat-sub' }, ['F', '1.ª', '2.ª'][k % 3]));
  for (let si = 0; si < SETS.length; si += 1) {
    grid.append(h('span', { class: 'hint' }, setName(si)));
    for (const q of QUALITIES) {
      for (let inv = 0; inv < 3; inv += 1) {
        const cell = stats[`${si}:${q}:${inv}`];
        const m = mastery(cell);
        grid.append(h('span', {
          class: 'triad-heat-cell',
          title: `${QUALITY_LABEL[q]} · ${INVERSION_LABELS[inv]} · cuerdas ${setName(si)}: ${m == null ? 'sin datos' : `${Math.round(m * 100)} %`}`,
          style: `background:${heatColor(m) ?? 'var(--line,#e5dfd2)'};opacity:${m == null ? 0.45 : 1}`,
        }));
      }
    }
  }
  return grid;
}

/**
 * @param {object} env { ctx, engine, board, stage, bigName, caption, st, keyPc, showSteps(steps, title), TUNING }
 */
export function createTriadModes(env) {
  const {
    ctx, engine, board, stage, bigName, caption, st, keyPc, TUNING,
  } = env;
  let mode = null;
  let timers = [];
  let stopListen = null;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(mode?.tick);
    stopListen?.();
    stopListen = null;
    mode = null;
  }

  const sortMarks = (marks) => [...marks].sort((a, b) => b.s - a.s);
  function drawMarks(marks, layer = 'notes') {
    board.dots(sortMarks(marks).map((m, j) => ({ key: `m-${j}`, s: m.s, f: m.f, label: noteName(TUNING[m.s] + m.f), fill: COLORS.note })), layer);
  }
  function showVoicing(v, chord, layer = 'notes', key = 'm') {
    const step = chordStep(v, chord, 2);
    board.dots(step.notes.map((n, j) => ({ key: `${key}-${j}`, s: n.s, f: n.f, label: ROLE_LABEL[n.role], fill: ROLE_COLOR[n.role] })), layer);
    return step;
  }
  function addMark(marks, hit) {
    const k = marks.findIndex((m) => m.s === hit.s && m.f === hit.f);
    if (k >= 0) { marks.splice(k, 1); return; }
    // Una nota por cuerda.
    for (let i = marks.length - 1; i >= 0; i -= 1) if (marks[i].s === hit.s) marks.splice(i, 1);
    marks.push(hit);
    engine.ensure().then(() => engine.pluck(TUNING[hit.s] + hit.f, engine.time + 0.01, { dur: 0.6 }));
  }

  /* ───── 1. reacción a tempo ───── */

  function startTempo() {
    stop();
    const t = { kind: 'tempo', bpm: ctx.storage.get('triad-tempo-bpm', 50), streak: 0, ok: 0, n: 0, running: false, q: null, marks: [], answered: false };
    mode = t;
    const info = h('div', { class: 'big-number', style: 'text-align:center' }, 'Pulsa «Empezar»');
    const stat = h('p', { class: 'hint', style: 'text-align:center' }, '');
    const fb = h('div', { class: 'feedback', hidden: true });
    const startBtn = button('▶ Empezar', { variant: 'accent', onClick: () => { if (t.running) halt(); else go(); } });
    const updateStat = () => { stat.textContent = `${t.bpm} bpm · ${t.ok}/${t.n} · racha ${t.streak}`; };
    stage.append(info, h('p', { class: 'hint', style: 'text-align:center' }, 'Un compás para marcar las tres notas. Tres aciertos seguidos: +4 bpm. Un fallo: −4 bpm.'), fb, h('div', { class: 'row', style: 'justify-content:center' }, startBtn), stat);
    updateStat();
    board.clear();
    bigName.textContent = '';
    caption.textContent = 'Reacción a tempo';

    function halt() {
      t.running = false;
      timers.forEach(clearTimeout);
      timers = [];
      startBtn.textContent = '▶ Empezar';
    }
    async function go() {
      await engine.ensure();
      t.running = true;
      startBtn.textContent = '■ Parar';
      bar();
    }
    function bar() {
      if (!t.running || mode !== t) return;
      t.q = drillQuestion({ set: st.set ?? 'all', stats: ctx.storage.get('triad-drill', {}) });
      t.marks = [];
      t.answered = false;
      t.at = performance.now();
      board.clear('notes');
      board.clear('trail');
      fb.hidden = true;
      bigName.textContent = prettyNote(t.q.chord.name);
      info.textContent = `${prettyNote(t.q.chord.name)} · ${INVERSION_LABELS[t.q.inv]} · cuerdas ${setName(t.q.set)}`;
      const spb = 60 / t.bpm;
      for (let k = 0; k < 4; k += 1) engine.click(engine.time + 0.05 + k * spb, { accent: k === 0, sound: 'click', vol: 0.6 });
      later(() => { if (!t.answered) judge(false, 'Se acabó el compás.'); later(bar, 700); }, 4 * spb * 1000 + 60);
    }
    function judge(ok, why) {
      t.answered = true;
      t.n += 1;
      const ms = performance.now() - t.at;
      ctx.storage.set('triad-drill', recordDrill(ctx.storage.get('triad-drill', {}), t.q.key, ok, ms));
      if (ok) {
        t.ok += 1;
        t.streak += 1;
        if (t.streak % 3 === 0) t.bpm = Math.min(160, t.bpm + 4);
      } else {
        t.streak = 0;
        t.bpm = Math.max(40, t.bpm - 4);
        const v = checkDrill(t.marks, t.q).voicing;
        if (v) showVoicing(v, t.q.chord, 'trail', 'sol');
      }
      ctx.storage.set('triad-tempo-bpm', t.bpm);
      fb.hidden = false;
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.textContent = ok ? `✓ ${(ms / 1000).toFixed(1)} s` : `✗ ${why}`;
      updateStat();
    }
    t.onClick = (hit) => {
      if (!t.running || t.answered) return;
      addMark(t.marks, hit);
      drawMarks(t.marks);
      if (t.marks.length === 3) {
        const res = checkDrill(t.marks, t.q);
        judge(res.ok, res.why);
      }
    };
  }

  /* ───── 2. las 12 formas en 60 segundos ───── */

  function startTwelve() {
    stop();
    const pick = st.quality && st.quality !== 'all' ? st.quality : 'maj';
    const rootPc = Math.floor(Math.random() * 12);
    const chord = { rootPc, typeId: pick, name: chordName(rootPc, pick) };
    const forms = allForms(chord);
    const t = { kind: 'twelve', chord, forms, found: new Set(), marks: [], left: 60, running: false, foundDots: [] };
    mode = t;
    const best = ctx.storage.get('triad-twelve-best', {});
    const clock = h('div', { class: 'big-number', style: 'text-align:center' }, '60 s');
    const grid = h('div', { class: 'triad-twelve' });
    const fb = h('div', { class: 'feedback', hidden: true });
    const drawGrid = () => {
      grid.replaceChildren(...forms.map((fm, i) => h('span', { class: `triad-twelve-cell${t.found.has(i) ? ' is-found' : ''}` }, `${setName(fm.si)} · ${['F', '1.ª', '2.ª'][fm.inv]}`)));
    };
    const rec = best[pick];
    stage.append(
      clock,
      h('p', { class: 'hint', style: 'text-align:center' }, `Encuentra las 12 formas de ${prettyNote(chord.name)}: marca tres notas y, si es una forma nueva, se queda en el mástil.${rec ? ` Récord en ${QUALITY_LABEL[pick]}: ${rec.count}/12${rec.count === 12 ? ` en ${rec.secs} s` : ''}.` : ''}`),
      grid, fb,
      h('div', { class: 'row', style: 'justify-content:center' }, button('▶ Empezar', { variant: 'accent', onClick: go }), button('Otro acorde', { variant: 'ghost', onClick: startTwelve })),
    );
    drawGrid();
    board.clear();
    bigName.textContent = prettyNote(chord.name);
    caption.textContent = `Las 12 formas de ${prettyNote(chord.name)}`;

    function go() {
      if (t.running) return;
      t.running = true;
      t.start = performance.now();
      t.tick = setInterval(() => {
        t.left = Math.max(0, 60 - Math.floor((performance.now() - t.start) / 1000));
        clock.textContent = `${t.left} s`;
        if (t.left <= 0) finish();
      }, 200);
    }
    function finish() {
      if (!t.running) return;
      t.running = false;
      clearInterval(t.tick);
      const secs = Math.round((performance.now() - t.start) / 1000);
      const prev = best[pick];
      const better = !prev || t.found.size > prev.count || (t.found.size === prev.count && secs < prev.secs);
      if (better) ctx.storage.set('triad-twelve-best', { ...best, [pick]: { count: t.found.size, secs } });
      fb.hidden = false;
      fb.className = `feedback ${t.found.size === 12 ? 'ok' : 'bad'}`;
      fb.textContent = `${t.found.size}/12 en ${secs} s${better ? ' · ¡récord!' : ''}`;
      // Enseña las que faltan, en gris.
      const missing = forms.map((fm, i) => ({ fm, i })).filter(({ i }) => !t.found.has(i) && forms[i].answers[0]);
      board.dots([...t.foundDots, ...missing.flatMap(({ fm, i }) => fm.answers[0].notes.map((n, j) => ({ key: `miss-${i}-${j}`, s: n.s, f: n.f, label: '', fill: '#fffdf8', stroke: '#8a8272', dashed: true, alpha: 0.8 })))], 'trail');
    }
    t.onClick = (hit) => {
      if (!t.running) go();
      addMark(t.marks, hit);
      drawMarks(t.marks);
      if (t.marks.length < 3) return;
      const i = matchForm(t.marks, forms, t.found);
      const marks = t.marks;
      t.marks = [];
      if (i >= 0) {
        t.found.add(i);
        const step = chordStep(forms[i].answers.find((v) => v.notes.every((n) => marks.some((m) => m.s === n.s && m.f === n.f))), chord, 2);
        t.foundDots.push(...step.notes.map((n, j) => ({ key: `found-${i}-${j}`, s: n.s, f: n.f, label: ROLE_LABEL[n.role], fill: ROLE_COLOR[n.role], alpha: 0.85, scale: 0.9 })));
        board.dots(t.foundDots, 'trail');
        board.clear('notes');
        engine.ensure().then(() => engine.strum(step.notes.map((n) => n.midi), engine.time + 0.02, { vel: 0.55, dur: 1 }));
        drawGrid();
        if (t.found.size === 12) finish();
      } else {
        fb.hidden = false;
        fb.className = 'feedback bad';
        fb.textContent = 'Esa no es una forma nueva de este acorde.';
        later(() => { board.clear('notes'); fb.hidden = true; }, 700);
      }
    };
  }

  /* ───── 14. dictado ───── */

  function startDictation() {
    stop();
    const q = dictationQuestion(keyPc(), Math.random, 1);
    const t = { kind: 'dictation', q, answer: [0, null, null, null], done: false };
    mode = t;
    const dia = diatonic(keyPc());
    const fb = h('div', { class: 'feedback', hidden: true });
    const slots = [1, 2, 3].map((slot) => segmented(ROMANS.slice(0, 6).map((r, k) => ({ value: String(k), label: r })), null, (v) => { t.answer[slot] = Number(v); }));
    const play = async () => {
      await engine.ensure();
      const spb = 60 / 72;
      q.steps.forEach((s, i) => engine.strum(s.notes.map((n) => n.midi), engine.time + 0.1 + i * 2 * spb, { vel: 0.6, dur: 2 * spb }));
      q.steps.forEach((s, i) => engine.bass(36 + s.chord.rootPc, engine.time + 0.1 + i * 2 * spb, 2 * spb * 0.9, 0.6));
    };
    board.clear();
    bigName.textContent = '? ? ? ?';
    caption.textContent = `Dictado en ${prettyNote(dia[0].name)} mayor: el primer acorde es I`;
    stage.append(
      h('div', { class: 'row', style: 'justify-content:center' }, button('🔊 Oír', { variant: 'accent', onClick: play })),
      h('div', { class: 'field' }, h('label', {}, '1.º acorde'), h('strong', {}, `I · ${prettyNote(dia[0].name)}`)),
      ...slots.map((sg, k) => h('div', { class: 'field' }, h('label', {}, `${k + 2}.º acorde`), sg)),
      h('div', { class: 'row', style: 'justify-content:center' },
        button('Comprobar', { variant: 'accent', onClick: check }),
        button('Otra', { variant: 'ghost', onClick: startDictation })),
      fb,
    );
    play();
    function check() {
      if (t.done) return;
      t.done = true;
      const right = q.degrees.map((d, i) => i === 0 || t.answer[i] === d);
      const ok = right.every(Boolean);
      const stats = ctx.storage.get('triad-dictation', { ok: 0, n: 0 });
      ctx.storage.set('triad-dictation', { ok: stats.ok + (ok ? 1 : 0), n: stats.n + 1 });
      fb.hidden = false;
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.textContent = `${ok ? '✓' : '✗'} Era ${q.degrees.map((d) => ROMANS[d]).join(' – ')} (${q.chords.map((c) => prettyNote(c.name)).join(' – ')}). Llevas ${stats.ok + (ok ? 1 : 0)}/${stats.n + 1}.`;
      bigName.textContent = q.chords.map((c) => prettyNote(c.name)).join(' ');
      // Se anima en el mástil y aparece en la partitura.
      env.showSteps(q.steps, 'Dictado', { autoplay: true });
    }
  }

  /* ───── 15. improvisación puntuada ───── */

  function setupImprov() {
    stop();
    const t = { kind: 'improv', passing: false, hits: 0, scale: 0, out: 0, last: null };
    mode = t;
    const score = h('div', { class: 'big-number', style: 'text-align:center' }, '—');
    const lastEl = h('p', { class: 'hint', style: 'text-align:center' }, 'Elige micrófono o MIDI y pulsa Reproducir: improvisa con las notas del acorde de cada compás.');
    const draw = () => {
      const total = t.hits + t.scale + t.out;
      const good = t.hits + (t.passing ? t.scale : 0);
      score.textContent = total ? `${Math.round((good / total) * 100)} % · ${t.hits} del acorde · ${t.scale} de paso · ${t.out} fuera` : '—';
    };
    const listen = async (source) => {
      stopListen?.();
      try {
        stopListen = await startNoteListener(engine, {
          source,
          isArmed: () => env.currentChord() != null,
          onNote: (midi) => {
            const chord = env.currentChord();
            if (!chord) return;
            const kind = judgeImprovNote(midi, chord, keyPc());
            if (kind === 'chord') t.hits += 1; else if (kind === 'scale') t.scale += 1; else t.out += 1;
            lastEl.textContent = `${noteName(midi)}: ${kind === 'chord' ? `nota del acorde (${prettyNote(chord.name)})` : kind === 'scale' ? 'nota de paso de la escala' : 'fuera de la tonalidad'}`;
            lastEl.style.color = kind === 'chord' ? COLORS.ok : kind === 'scale' ? '#8a8272' : COLORS.bad;
            draw();
          },
        });
        ctx.toast(source === 'mic' ? 'Micrófono activo' : 'Escuchando MIDI');
      } catch (e) {
        ctx.toast(`No se pudo abrir ${source === 'mic' ? 'el micrófono' : 'MIDI'}: ${e.message}`);
      }
    };
    stage.append(
      h('div', { class: 'row', style: 'justify-content:center' },
        button('🎤 Micrófono', { variant: 'outline', onClick: () => listen('mic') }),
        button('🎹 MIDI', { variant: 'outline', onClick: () => listen('midi') }),
        button('Reiniciar puntos', { variant: 'ghost', onClick: () => { Object.assign(t, { hits: 0, scale: 0, out: 0 }); draw(); } })),
      toggle('Contar las notas de paso de la escala como buenas', false, (v) => { t.passing = v; draw(); env.redraw?.(); }),
      score, lastEl,
    );
    t.isPassing = () => t.passing;
  }

  return {
    get mode() { return mode; },
    stop,
    start(kind) {
      if (kind === 'tempo') startTempo();
      else if (kind === 'twelve') startTwelve();
      else if (kind === 'dictation') startDictation();
      else if (kind === 'improv') setupImprov();
    },
    /** Devuelve true si el modo activo ha usado el clic. */
    onClick(hit) {
      if (mode?.onClick) { mode.onClick(hit); return true; }
      return false;
    },
    passing: () => mode?.isPassing?.() ?? false,
  };
}

export { ROMANS };
