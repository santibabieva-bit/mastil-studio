/**
 * Bends y vibrato con micrófono: mide cuántos cents te quedas corto o te
 * pasas en un bend y la velocidad, amplitud y regularidad de tu vibrato.
 */

import {
  TUNINGS, midiName, midiToFreq, prettyNote,
} from '../core/music.js';
import { detectPitch } from '../core/pitch.js';
import {
  BEND_TARGETS, analyzeBend, analyzeVibrato, bendScore, centsBetween, vibratoScore,
} from '../core/bend.js';
import { dateKey } from '../core/practice.js';
import { openMic } from '../audio/mic.js';
import {
  button, clear, h, segmented, select, slider,
} from '../ui/dom.js';
import { header } from './common.js';

const STRINGS = ['1.ª (Mi agudo)', '2.ª (Si)', '3.ª (Sol)', '4.ª (Re)'];

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    tab: 'bend',
    string: ctx.storage.get('bend-string', 1),
    fret: ctx.storage.get('bend-fret', 7),
    target: ctx.storage.get('bend-target', 'whole'),
    seconds: 3,
  };
  let mic = null;
  let timer = 0;
  let busy = false;
  const buf = new Float32Array(2048);
  const live = h('div', { class: 'tempo-name', style: 'text-align:center;min-height:1.4em' }, '');
  const status = h('p', { class: 'hint', style: 'text-align:center;min-height:1.3em' }, 'Activa el micrófono y pulsa «Grabar intento».');
  const stage = h('div', { class: 'stack' });
  const results = h('div', { class: 'stack' });
  ctx.onCleanup(() => {
    clearInterval(timer);
    mic?.close();
  });

  const startMidi = () => tuning[cfg.string] + cfg.fret;
  const def = () => BEND_TARGETS.find((t) => t.id === cfg.target) ?? BEND_TARGETS[1];
  const targetMidi = () => startMidi() + def().semitones;

  async function ensureMic() {
    if (mic) return true;
    try {
      mic = await openMic(engine, { fftSize: 2048 });
      return true;
    } catch {
      status.textContent = 'No he podido acceder al micrófono. Revisa los permisos (HTTPS o localhost).';
      return false;
    }
  }

  async function listen(seconds) {
    const track = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      timer = setInterval(() => {
        mic.analyser.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 70, maxFreq: 1400, threshold: 0.01 });
        const t = (performance.now() - t0) / 1000;
        track.push({ t, freq });
        if (freq && cfg.tab === 'bend') {
          const c = Math.round(centsBetween(freq, midiToFreq(targetMidi())));
          live.textContent = `${c > 0 ? '+' : ''}${c} cents del objetivo`;
        }
        if (t >= seconds) { clearInterval(timer); resolve(); }
      }, 22);
    });
    live.textContent = '';
    return track;
  }

  async function record() {
    if (busy) return;
    busy = true;
    try {
      if (!(await ensureMic())) return;
      for (let n = 3; n > 0; n -= 1) {
        status.textContent = `Prepárate… ${n}`;
        await new Promise((r) => setTimeout(r, 700));
      }
      status.textContent = cfg.tab === 'bend' ? '¡Toca y hazle el bend!' : '¡Sostén la nota con vibrato!';
      engine.notePlaying('bendlab', true);
      const track = await listen(cfg.seconds);
      engine.notePlaying('bendlab', false);
      status.textContent = 'Listo.';
      if (cfg.tab === 'bend') showBend(track);
      else showVibrato(track);
    } finally {
      busy = false;
    }
  }

  function save(kind, score) {
    const list = ctx.storage.get('pitch-history', []);
    list.push({ date: dateKey(), kind, score });
    ctx.storage.set('pitch-history', list.slice(-80));
    ctx.logSeconds(cfg.seconds + 3);
  }

  function curve(track, { targetFreq = null, base = null }) {
    const w = 640;
    const ht = 160;
    const voiced = track.filter((p) => p.freq);
    if (!voiced.length) return h('p', { class: 'hint' }, 'Sin nota detectada.');
    const ref = targetFreq ?? base;
    const cents = voiced.map((p) => centsBetween(p.freq, ref));
    const range = Math.max(150, ...cents.map(Math.abs)) * 1.1;
    const t1 = Math.max(0.1, track[track.length - 1].t);
    const x = (t) => 10 + (t / t1) * (w - 20);
    const y = (c) => ht / 2 - (c / range) * (ht / 2 - 8);
    const pts = voiced.map((p, i) => `${x(p.t).toFixed(1)},${y(cents[i]).toFixed(1)}`).join(' ');
    const el = h('div', { class: 'timeline' });
    el.innerHTML = `<svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="Altura de tu nota en cents respecto a la referencia"><rect x="0" y="${y(25)}" width="${w}" height="${y(-25) - y(25)}" fill="var(--ok)" opacity=".15"/><line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".4"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
    return el;
  }

  function showBend(track) {
    clear(results);
    const startFreq = midiToFreq(def().prebend ? targetMidi() : startMidi());
    const targetFreq = midiToFreq(targetMidi());
    const a = analyzeBend(track, { startFreq, targetFreq });
    const score = bendScore(a);
    if (a.finalCents != null) save('bend', score);
    results.append(
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Resultado del bend'),
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(score)), h('div', { class: 'hint' }, 'Nota')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, a.finalCents == null ? '–' : `${a.finalCents > 0 ? '+' : ''}${a.finalCents}`), h('div', { class: 'hint' }, 'Cents al final')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, a.timeToTarget == null ? '–' : `${a.timeToTarget.toFixed(2)} s`), h('div', { class: 'hint' }, 'Tiempo en llegar')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, a.stability == null ? '–' : `${a.stability}`), h('div', { class: 'hint' }, 'Temblor (cents)')),
        ),
        h('p', {}, a.verdict),
        curve(track, { targetFreq }),
        h('p', { class: 'hint' }, 'La banda verde es el objetivo (±25 cents). La línea central es la nota de destino.'),
      ),
    );
  }

  function showVibrato(track) {
    clear(results);
    const base = track.find((p) => p.freq)?.freq ?? 440;
    const v = analyzeVibrato(track);
    const score = vibratoScore(v);
    if (v.ok) save('vibrato', score);
    results.append(
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Resultado del vibrato'),
        v.ok ? h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(score)), h('div', { class: 'hint' }, 'Nota')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${v.rate} Hz`), h('div', { class: 'hint' }, 'Velocidad (ideal 5–7,5)')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `±${v.width}`), h('div', { class: 'hint' }, 'Amplitud en cents (ideal 20–70)')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${v.regularity} %`), h('div', { class: 'hint' }, 'Regularidad')),
        ) : null,
        h('p', {}, v.verdict),
        curve(track, { base }),
      ),
    );
  }

  async function playRef(midi) {
    await engine.ensure();
    engine.pluck(midi, engine.time + 0.02, { dur: 1.6, vel: 0.85 });
  }

  function draw() {
    clear(stage);
    clear(results);
    const tabs = segmented([{ value: 'bend', label: 'Bends' }, { value: 'vibrato', label: 'Vibrato' }], cfg.tab, (v) => { cfg.tab = v; draw(); });
    const common = [
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Cuerda'), select(STRINGS.map((l, i) => ({ value: i, label: l })), cfg.string, (v) => { cfg.string = Number(v); ctx.storage.set('bend-string', cfg.string); draw(); })),
        slider({ min: 1, max: 15, value: cfg.fret, label: 'Traste', format: (v) => `${v}`, onInput: (v) => { cfg.fret = v; ctx.storage.set('bend-fret', v); refreshNames(); } }),
      ),
    ];
    const names = h('p', { class: 'hint', style: 'text-align:center' }, '');
    function refreshNames() {
      names.textContent = cfg.tab === 'bend'
        ? `Parte de ${prettyNote(midiName(startMidi()))} y sube a ${prettyNote(midiName(targetMidi()))}${def().prebend ? ' (pre-bend: dobla antes de picar y suelta)' : ''}.`
        : `Sostén ${prettyNote(midiName(startMidi()))} con vibrato durante unos segundos.`;
    }
    refreshNames();
    const bendOpts = cfg.tab === 'bend'
      ? [h('div', { class: 'field' }, h('label', {}, 'Tipo de bend'), select(BEND_TARGETS.map((t) => ({ value: t.id, label: t.label })), cfg.target, (v) => { cfg.target = v; ctx.storage.set('bend-target', v); refreshNames(); }))]
      : [];
    stage.append(
      h('div', { class: 'row' }, tabs),
      h('section', { class: 'panel stack' },
        ...common,
        ...bendOpts,
        names,
        h('div', { class: 'row', style: 'justify-content:center' },
          button('🔊 Oír nota de salida', { variant: 'outline', onClick: () => playRef(startMidi()) }),
          cfg.tab === 'bend' ? button('🔊 Oír nota objetivo', { variant: 'outline', onClick: () => playRef(targetMidi()) }) : null,
        ),
        h('div', { class: 'row', style: 'justify-content:center' }, button('🎤 Grabar intento', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: record })),
        live,
        status,
      ),
      results,
    );
  }

  root.append(
    header('Oído y afinación', 'Bends y vibrato', 'Toca un bend o un vibrato y la app mide, con el micrófono, cuántos cents te quedas corto o te pasas, cuánto tiembla la nota y la velocidad y amplitud de tu vibrato.'),
    stage,
    h('section', { class: 'panel' }, h('h2', {}, 'Consejos'), h('p', { class: 'hint' }, 'Hazlo con una sola cuerda y sin otras cuerdas sonando. Primero oye la nota objetivo, intenta «cantarla» con el bend y comprueba en la curva si llegas y te estabilizas. Para el vibrato mueve la muñeca (no el dedo) y busca una velocidad pareja.')),
  );
  draw();
}

export default {
  id: 'bendlab',
  title: 'Bends y vibrato',
  group: 'ears',
  icon: '∿',
  summary: 'Mide con el micrófono la afinación de tus bends y la velocidad y amplitud del vibrato.',
  isNew: true,
  mount,
};
