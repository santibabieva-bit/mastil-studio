/**
 * Toca lo que oyes: suena una melodía corta de una escala y la encuentras en
 * el mástil de oído. Se valida con el micrófono, con una guitarra MIDI o a mano.
 */

import {
  midiName, prettyNote, ROOT_CHOICES,
} from '../core/music.js';
import { detectPitch } from '../core/pitch.js';
import {
  EARPLAY_LEVELS, MelodyMatcher, describeMelody, earplayLevel, earplayRate, melodyQuestion,
} from '../core/earplay.js';
import { listenMidi } from '../audio/midiin.js';
import { openMic } from '../audio/mic.js';
import {
  button, clear, h, segmented, select, toggle,
} from '../ui/dom.js';
import { header } from './common.js';

const HISTORY_MAX = 60;

function mount(root, ctx) {
  const { engine } = ctx;
  const p = ctx.params;
  const cfg = {
    level: Number(p.level ?? ctx.storage.get('earplay-level', 1)) || 1,
    root: p.root ?? ctx.session.get().root ?? 'A',
    source: ctx.storage.get('earplay-source', 'mic'),
    strict: ctx.storage.get('earplay-strict', false),
    hint: false,
  };
  const state = { q: null, matcher: null, active: false, armedAt: 0 };
  let mic = null;
  let stopMidi = null;
  let timer = 0;
  let last = null;
  let silent = true;
  let streakMidi = null;
  let streak = 0;
  const buf = new Float32Array(2048);

  const stage = h('div', { class: 'stack' });
  const dots = h('div', { class: 'row', style: 'justify-content:center;gap:10px' });
  const prompt = h('div', { class: 'big-number', style: 'text-align:center;min-height:1.2em' }, '♪');
  const sub = h('p', { class: 'hint', style: 'text-align:center;min-height:1.3em' }, 'Pulsa «Nueva melodía»: oirás la tónica y luego la melodía. Encuéntrala en tu guitarra.');
  const feedback = h('div', { class: 'feedback', hidden: true });
  const statsEl = h('div', { class: 'stack' });
  const manualBox = h('div', { class: 'row', style: 'justify-content:center' });

  ctx.onCleanup(() => { clearInterval(timer); mic?.close(); stopMidi?.(); });

  const msg = (text, kind = 'ok') => { feedback.hidden = !text; feedback.className = `feedback ${kind}`; feedback.textContent = text; };

  async function playMelody({ reference = true } = {}) {
    if (!state.q) return;
    await engine.ensure();
    const t0 = engine.time + 0.08;
    let t = t0;
    if (reference) {
      engine.pluck(state.q.refMidi, t, { vel: 0.8, dur: 1.2 });
      t += 1.3;
    }
    state.q.notes.forEach((n, i) => engine.pluck(n.midi, t + i * 0.7, { vel: 0.8, dur: 0.9 }));
    state.armedAt = performance.now() + (t - t0 + state.q.notes.length * 0.7) * 1000 + 200;
  }

  async function newMelody() {
    msg('');
    if (cfg.source === 'mic' && !mic) {
      try { mic = await openMic(engine, { fftSize: 2048 }); } catch { msg('No he podido usar el micrófono. Revisa los permisos o elige «Manual».', 'bad'); return; }
    }
    if (cfg.source === 'midi' && !stopMidi) {
      try { stopMidi = await listenMidi({ onNote: (midi, on) => { if (on) heard(midi); } }); } catch (e) { msg(e.message, 'bad'); return; }
    }
    state.q = melodyQuestion({ root: cfg.root, level: cfg.level });
    state.matcher = new MelodyMatcher(state.q.notes, { strictOctave: cfg.strict });
    state.active = true;
    last = null;
    silent = true;
    prompt.textContent = `♪ ${prettyNote(cfg.root)} · ${state.q.notes.length} notas`;
    sub.textContent = cfg.hint ? `Grados: ${describeMelody(state.q)}` : 'Escucha, y tócala nota a nota. Puedes repetirla las veces que quieras.';
    draw();
    await playMelody();
    if (cfg.source === 'mic') listen();
  }

  function listen() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!state.active || performance.now() < state.armedAt) return;
      mic.analyser.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1400, threshold: 0.012 });
      if (!f) { streakMidi = null; streak = 0; silent = true; return; }
      const m = Math.round(69 + 12 * Math.log2(f / 440));
      if (m === streakMidi) streak += 1;
      else { streakMidi = m; streak = 1; }
      // Una nota sostenida cuenta una sola vez: hace falta cambiar de nota o silencio.
      if (streak >= 4 && (m !== last || silent)) { last = m; silent = false; heard(m); }
    }, 30);
  }

  function heard(midi) {
    if (!state.active || performance.now() < state.armedAt) return;
    const m = state.matcher;
    const verdict = m.hear(midi);
    if (verdict === 'ignored') return;
    if (verdict === 'wrong') msg(`✗ ${prettyNote(midiName(midi))}: no es la nota ${m.index + 1}. Vuelve a escuchar y prueba otra.`, 'bad');
    else msg(`✓ ${prettyNote(midiName(midi))}${verdict === 'octave' ? ' (otra octava)' : ''}`, 'ok');
    draw();
    if (m.done || m.failed) finish();
  }

  function manualMark(ok) {
    if (!state.active) return;
    const m = state.matcher;
    if (ok) while (!m.done) m.hear(state.q.notes[m.index].midi);
    else m.errors = m.maxErrors;
    finish();
  }

  function finish() {
    state.active = false;
    clearInterval(timer);
    const m = state.matcher;
    const s = m.summary();
    const list = ctx.storage.get('earplay-history', []);
    list.push({ date: new Date().toISOString().slice(0, 10), level: cfg.level, ok: s.ok, firstTry: s.firstTry, total: s.total });
    ctx.storage.set('earplay-history', list.slice(-HISTORY_MAX));
    ctx.logSeconds(Math.max(10, s.total * 6));
    const notes = state.q.notes.map((n) => prettyNote(midiName(n.midi))).join(' ');
    msg(s.ok
      ? `🎉 Melodía completa: ${s.firstTry}/${s.total} a la primera. Eran ${notes} (grados ${describeMelody(state.q)}).`
      : `Era: ${notes} (grados ${describeMelody(state.q)}). Escúchala otra vez y compárala con tu guitarra.`, s.ok ? 'ok' : 'bad');
    draw();
    drawStats();
  }

  function draw() {
    clear(dots);
    clear(manualBox);
    const m = state.matcher;
    if (m) {
      state.q.notes.forEach((_, i) => {
        const done = i < m.index;
        dots.append(h('span', { class: 'pill', style: done ? 'background:var(--green,#2f8a57);color:#fff' : i === m.index && state.active ? 'outline:2px solid var(--orange,#d9761c)' : '' }, done ? '✓' : String(i + 1)));
      });
    }
    if (state.active) {
      manualBox.append(button('🔊 Repetir melodía', { variant: 'outline', onClick: () => playMelody() }));
      manualBox.append(button('🎯 Solo la tónica', { variant: 'ghost', onClick: async () => { await engine.ensure(); engine.pluck(state.q.refMidi, engine.time + 0.05, { vel: 0.8, dur: 1.2 }); } }));
      if (cfg.source === 'manual') {
        manualBox.append(button('✓ La toqué bien', { variant: 'accent', onClick: () => manualMark(true) }), button('✗ No me salió', { variant: 'outline', onClick: () => manualMark(false) }));
      }
    } else if (state.q) {
      manualBox.append(button('🔊 Escuchar otra vez', { variant: 'outline', onClick: () => { state.armedAt = Infinity; playMelody(); } }));
    }
  }

  function drawStats() {
    clear(statsEl);
    const hist = ctx.storage.get('earplay-history', []);
    const rows = EARPLAY_LEVELS.map((lv) => ({ lv, ...earplayRate(hist, lv.id) })).filter((r) => r.runs);
    statsEl.append(h('h2', {}, 'Tu progreso'));
    if (!rows.length) { statsEl.append(h('p', { class: 'hint' }, 'Aún no has completado ninguna melodía.')); return; }
    for (const r of rows) statsEl.append(h('p', { class: 'hint' }, `${r.lv.label}: ${Math.round(r.rate * 100)} % en las últimas ${r.runs}.`));
    const cur = earplayRate(hist, cfg.level);
    if (cur.runs >= 5 && cur.rate >= 0.8 && cfg.level < EARPLAY_LEVELS.length) statsEl.append(h('p', { class: 'feedback ok' }, `Dominas este nivel: prueba el ${cfg.level + 1}.`));
  }

  root.append(
    header('Oído y afinación', 'Toca lo que oyes', 'Oyes una melodía corta y la encuentras en el mástil de oído, sin tab ni diagrama. Es el ejercicio que conecta el oído con la mano izquierda: lo que oyes por dentro, lo tocas.'),
    h('div', { class: 'tool-grid' },
      h('section', { class: 'panel stack' },
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, 'Nivel'), select(EARPLAY_LEVELS.map((l) => ({ value: l.id, label: l.label })), cfg.level, (v) => { cfg.level = Number(v); ctx.storage.set('earplay-level', cfg.level); drawStats(); })),
          h('div', { class: 'field' }, h('label', {}, 'Tonalidad'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; })),
        ),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Cómo respondes'), segmented([{ value: 'mic', label: 'Micrófono' }, { value: 'midi', label: 'Guitarra MIDI' }, { value: 'manual', label: 'Manual' }], cfg.source, (v) => { cfg.source = v; ctx.storage.set('earplay-source', v); draw(); })),
        toggle('Exigir la misma octava', cfg.strict, (v) => { cfg.strict = v; ctx.storage.set('earplay-strict', v); }),
        toggle('Mostrar los grados como pista', cfg.hint, (v) => { cfg.hint = v; }),
        dots,
        prompt,
        sub,
        manualBox,
        feedback,
        h('div', { class: 'row', style: 'justify-content:center' }, button('Nueva melodía', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: newMelody })),
      ),
      h('section', { class: 'panel stack' }, statsEl,
        h('p', { class: 'hint' }, `${earplayLevel(cfg.level).label}. Consejo: canta o tararea la melodía antes de buscarla; si puedes cantarla, tu mano ya sabe dónde ir.`)),
    ),
  );
  drawStats();
}

export default {
  id: 'earplay',
  title: 'Toca lo que oyes',
  group: 'ears',
  icon: '👂',
  summary: 'Escucha una melodía y encuéntrala en el mástil de oído; micrófono, MIDI o manual.',
  isNew: true,
  mount,
};
