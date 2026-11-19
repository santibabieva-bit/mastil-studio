/**
 * Mástil a ciegas: la app pide una nota en una cuerda y tú la tocas sin
 * mirar el mástil. Se valida con el micrófono o con una guitarra MIDI.
 */

import {
  TUNINGS, midiName, midiToFreq, pcName, prettyNote,
} from '../core/music.js';
import { detectPitch } from '../core/pitch.js';
import { blindQuestion, checkBlind, summarize } from '../core/blind.js';
import { listenMidi } from '../audio/midiin.js';
import { openMic } from '../audio/mic.js';
import {
  button, clear, h, segmented, slider,
} from '../ui/dom.js';
import { header } from './common.js';
import { logSpot } from './neckmap.js';

const ROUND = 10;

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    source: ctx.storage.get('blind-source', 'mic'),
    maxFret: ctx.storage.get('blind-fret', 9),
    strings: ctx.storage.get('blind-strings', 'all'),
  };
  const round = { q: null, results: [], askedAt: 0, armedAt: 0, active: false };
  let mic = null;
  let timer = 0;
  let stopMidi = null;
  const buf = new Float32Array(2048);
  let streakMidi = null;
  let streak = 0;
  const stage = h('div', { class: 'stack' });
  const prompt = h('div', { class: 'big-number', style: 'text-align:center;min-height:1.2em' }, '–');
  const sub = h('p', { class: 'hint', style: 'text-align:center;min-height:1.3em' }, 'Pulsa «Empezar ronda» y toca sin mirar el mástil.');
  const feedback = h('div', { class: 'feedback', hidden: true });
  const progress = h('div', { class: 'progress' }, h('i', { style: 'width:0%' }));
  const summary = h('div', { class: 'stack' });
  const startBtn = button('Empezar ronda', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: begin });

  ctx.onCleanup(() => {
    clearInterval(timer);
    mic?.close();
    stopMidi?.();
  });

  const pool = () => (cfg.strings === 'all' ? null : cfg.strings === 'low' ? [3, 4, 5] : [0, 1, 2]);

  function msg(text, kind = 'ok') { feedback.hidden = !text; feedback.className = `feedback ${kind}`; feedback.textContent = text; }

  async function begin() {
    clear(summary);
    round.results = [];
    msg('');
    if (cfg.source === 'mic' && !mic) {
      try { mic = await openMic(engine, { fftSize: 2048 }); } catch { msg('No he podido usar el micrófono. Revisa los permisos o elige «Manual».', 'bad'); return; }
    }
    if (cfg.source === 'midi' && !stopMidi) {
      try { stopMidi = await listenMidi({ onNote: (midi, on) => { if (on) answerWith(midi); } }); } catch (e) { msg(e.message, 'bad'); return; }
    }
    startBtn.hidden = true;
    ask();
    if (cfg.source === 'mic') listen();
  }

  function ask() {
    round.q = blindQuestion({ tuning, strings: pool(), maxFret: cfg.maxFret });
    round.askedAt = performance.now();
    round.armedAt = round.askedAt + 800;
    round.active = true;
    streakMidi = null;
    streak = 0;
    prompt.textContent = `${prettyNote(pcName(round.q.pc, 'sharp'))} · cuerda ${round.q.s + 1}`;
    sub.textContent = cfg.source === 'manual' ? 'Tócala y marca el resultado.' : 'Tócala y la detecto sola.';
    progress.firstChild.style.width = `${(round.results.length / ROUND) * 100}%`;
    drawManual();
  }

  function listen() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!round.active || performance.now() < round.armedAt) return;
      mic.analyser.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1400, threshold: 0.012 });
      if (!f) { streakMidi = null; streak = 0; return; }
      const m = Math.round(69 + 12 * Math.log2(f / 440));
      if (m === streakMidi) streak += 1;
      else { streakMidi = m; streak = 1; }
      if (streak >= 4) answerWith(m);
    }, 30);
  }

  function answerWith(midi) {
    if (!round.active || performance.now() < round.armedAt) return;
    round.active = false;
    const verdict = checkBlind(midi, round.q);
    const ms = performance.now() - round.askedAt;
    const ok = verdict !== 'wrong';
    round.results.push({ ok, ms });
    logSpot(ctx, round.q.s, round.q.f, ok, ms);
    ctx.logSeconds(Math.round(ms / 1000));
    msg(ok
      ? `✓ ${prettyNote(midiName(midi))}${verdict === 'octave' ? ' (otra octava)' : ''} · ${(ms / 1000).toFixed(1)} s`
      : `✗ Era traste ${round.q.f} (${prettyNote(midiName(round.q.midi))}); tocaste ${prettyNote(midiName(midi))}.`, ok ? 'ok' : 'bad');
    next();
  }

  function mark(ok) {
    if (!round.active) return;
    round.active = false;
    const ms = performance.now() - round.askedAt;
    round.results.push({ ok, ms });
    logSpot(ctx, round.q.s, round.q.f, ok, ms);
    msg(ok ? '✓ Bien' : `✗ Era el traste ${round.q.f} (${prettyNote(midiName(round.q.midi))}).`, ok ? 'ok' : 'bad');
    next();
  }

  function next() {
    drawManual();
    if (round.results.length >= ROUND) { setTimeout(finish, 600); return; }
    setTimeout(ask, 900);
  }

  function finish() {
    clearInterval(timer);
    round.active = false;
    prompt.textContent = '–';
    sub.textContent = 'Ronda terminada.';
    progress.firstChild.style.width = '100%';
    const s = summarize(round.results);
    const best = ctx.storage.get('blind-best', null);
    const better = !best || s.ok > best.ok || (s.ok === best.ok && s.avgMs < best.avgMs);
    if (better) ctx.storage.set('blind-best', s);
    summary.append(h('section', { class: 'panel stack' },
      h('h2', {}, 'Resumen'),
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${s.ok}/${s.total}`), h('div', { class: 'hint' }, 'Aciertos')),
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, s.avgMs ? `${(s.avgMs / 1000).toFixed(1)} s` : '–'), h('div', { class: 'hint' }, 'Tiempo medio')),
      ),
      better ? h('p', { class: 'feedback ok' }, '🏆 Mejor ronda hasta ahora.') : h('p', { class: 'hint' }, `Mejor ronda: ${best.ok}/${ROUND} en ${(best.avgMs / 1000).toFixed(1)} s.`),
      h('p', { class: 'hint' }, 'Cuando aciertes 9 o más en menos de 3 s, sube el traste máximo.'),
    ));
    startBtn.hidden = false;
    startBtn.textContent = 'Otra ronda';
    void midiToFreq;
  }

  const manualBox = h('div', { class: 'row', style: 'justify-content:center' });
  function drawManual() {
    clear(manualBox);
    if (cfg.source !== 'manual' || !round.active) return;
    manualBox.append(
      button('✓ La toqué bien', { variant: 'accent', onClick: () => mark(true) }),
      button('✗ Fallé', { variant: 'outline', onClick: () => mark(false) }),
    );
  }

  root.append(
    header('Aprender el mástil', 'Mástil a ciegas', 'Sin mirar el mástil: la app pide una nota en una cuerda y tú la encuentras. Entrena la memoria real del mástil, no la lectura del diagrama.'),
    h('section', { class: 'panel stack' },
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Cómo respondes'), segmented([{ value: 'mic', label: 'Micrófono' }, { value: 'midi', label: 'Guitarra MIDI' }, { value: 'manual', label: 'Manual' }], cfg.source, (v) => { cfg.source = v; ctx.storage.set('blind-source', v); drawManual(); })),
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Cuerdas'), segmented([{ value: 'all', label: 'Todas' }, { value: 'high', label: 'Agudas (1-3)' }, { value: 'low', label: 'Graves (4-6)' }], cfg.strings, (v) => { cfg.strings = v; ctx.storage.set('blind-strings', v); })),
      slider({ min: 3, max: 15, value: cfg.maxFret, label: 'Traste máximo', format: (v) => `${v}`, onInput: (v) => { cfg.maxFret = v; ctx.storage.set('blind-fret', v); } }),
      progress,
      prompt,
      sub,
      manualBox,
      feedback,
      h('div', { class: 'row', style: 'justify-content:center' }, startBtn),
    ),
    summary,
  );
}

export default {
  id: 'blind',
  title: 'Mástil a ciegas',
  group: 'neck',
  icon: '◐',
  summary: 'Encuentra notas en el mástil sin mirarlo; se valida con micrófono o MIDI.',
  isNew: true,
  mount,
};
