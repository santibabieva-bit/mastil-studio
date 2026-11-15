/**
 * Timing Lab: toca con el metrónomo y mide, con el micrófono, cuánto se
 * desvía cada nota del pulso (en milisegundos).
 */

import { clampBpm } from '../core/rhythm.js';
import {
  calibrationLatency, detectOnsets, gridDeviations, timingStats, timingVerdict,
} from '../core/timing.js';
import { dateKey } from '../core/practice.js';
import { createRecorder, openMic } from '../audio/mic.js';
import { button, clear, h, segmented, slider } from '../ui/dom.js';
import { header } from './common.js';

const SUBS = [
  { value: 1, label: 'Negras' },
  { value: 2, label: 'Corcheas' },
  { value: 3, label: 'Tresillos' },
  { value: 4, label: 'Semicorcheas' },
];

const CLICK_MODES = [
  { value: 'all', label: 'Clic siempre' },
  { value: 'intro', label: 'Sólo la cuenta' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const cfg = {
    bpm: ctx.storage.get('timing-bpm', 80),
    sub: ctx.storage.get('timing-sub', 2),
    bars: ctx.storage.get('timing-bars', 4),
    mode: ctx.storage.get('timing-mode', 'all'),
    latency: ctx.storage.get('timing-latency', 0),
  };
  let mic = null;
  let recorder = null;
  let busy = false;
  const status = h('div', { class: 'hint', style: 'text-align:center;min-height:1.4em' }, 'Conecta auriculares para que el clic no entre en el micrófono.');
  const results = h('div', { class: 'stack' });
  const history = h('div', { class: 'stack' });
  const startBtn = button('🎤 Empezar a medir', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: () => run('measure') });
  const calBtn = button('Calibrar latencia', { variant: 'outline', onClick: () => run('calibrate') });

  ctx.onCleanup(() => {
    recorder?.dispose();
    mic?.close();
  });

  async function ensureMic() {
    if (mic) return true;
    try {
      mic = await openMic(engine);
      recorder = createRecorder(engine, mic.source);
      return true;
    } catch {
      status.textContent = 'No he podido acceder al micrófono. Revisa los permisos (hace falta HTTPS o localhost).';
      return false;
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(kind) {
    if (busy) return;
    busy = true;
    startBtn.disabled = true;
    calBtn.disabled = true;
    try {
      if (!(await ensureMic())) return;
      const beat = 60 / cfg.bpm;
      const calibrating = kind === 'calibrate';
      const bars = calibrating ? 2 : cfg.bars;
      const perBeat = calibrating ? 1 : cfg.sub;
      const intro = 4;
      const total = intro + bars * 4;
      const t0 = engine.time + 0.4;
      recorder.start();
      for (let i = 0; i < total; i += 1) {
        const audible = calibrating || cfg.mode === 'all' || i < intro + 4;
        if (!audible) break;
        engine.click(t0 + i * beat, { accent: i % 4 === 0, sound: 'wood', vol: 1 });
        if (!calibrating && cfg.mode === 'all' && perBeat > 1 && i >= intro) {
          for (let k = 1; k < perBeat; k += 1) engine.click(t0 + i * beat + (k * beat) / perBeat, { accent: false, sound: 'click', vol: 0.35 });
        }
      }
      status.textContent = 'Cuenta atrás… toca cuando termine (4 pulsos).';
      engine.notePlaying('timing', true);
      await wait((t0 - engine.time + intro * beat) * 1000);
      status.textContent = calibrating ? 'Toca una nota en cada clic.' : `Toca ${bars * 4 * perBeat} notas en ${bars} compases.`;
      await wait(bars * 4 * beat * 1000 + 700);
      engine.notePlaying('timing', false);
      const rec = recorder.stop();
      const grid0 = t0 + intro * beat;
      const onsets = detectOnsets(rec.samples, rec.sampleRate).map((o) => rec.toContextTime(o));
      const devs = gridDeviations({
        onsets, t0: grid0, bpm: cfg.bpm, perBeat, latencyMs: calibrating ? 0 : cfg.latency, count: bars * 4 * perBeat,
      });
      if (calibrating) {
        if (devs.length < 4) { status.textContent = 'Pocas notas detectadas. Inténtalo de nuevo, más fuerte y con ataque claro.'; return; }
        cfg.latency = calibrationLatency(devs);
        ctx.storage.set('timing-latency', cfg.latency);
        latencySlider.setValue(cfg.latency);
        status.textContent = `Latencia guardada: ${cfg.latency} ms.`;
        return;
      }
      const stats = timingStats(devs, { expected: bars * 4 * perBeat });
      showResults(stats, devs, perBeat);
      if (stats.n) saveSession(stats, perBeat);
      ctx.logSeconds(Math.round((intro + bars * 4) * beat));
      status.textContent = 'Listo. Puedes repetir.';
    } finally {
      busy = false;
      startBtn.disabled = false;
      calBtn.disabled = false;
    }
  }

  function saveSession(stats, perBeat) {
    const list = ctx.storage.get('timing-history', []);
    list.push({ date: dateKey(), bpm: cfg.bpm, sub: perBeat, sd: Math.round(stats.sd * 10) / 10, mean: Math.round(stats.mean * 10) / 10, score: stats.score, n: stats.n });
    ctx.storage.set('timing-history', list.slice(-60));
    drawHistory();
  }

  function showResults(stats, devs) {
    clear(results);
    if (!stats.n) {
      results.append(h('section', { class: 'panel' }, h('p', {}, timingVerdict(stats))));
      return;
    }
    const maxCount = Math.max(1, ...stats.hist.map((b) => b.count));
    const bars = stats.hist.map((b) => h('div', { class: 'hist-col', title: `${b.lo} a ${b.hi} ms: ${b.count}` },
      h('div', { class: `hist-bar ${b.lo >= -10 && b.hi <= 10 ? 'is-ok' : ''}`, style: `height:${Math.round((b.count / maxCount) * 100)}%` }),
      h('div', { class: 'hist-label' }, String(b.lo >= 0 ? b.hi : b.lo)),
    ));
    const width = 640;
    const height = 120;
    const maxIdx = Math.max(1, ...devs.map((d) => d.index));
    const dots = devs.map((d) => {
      const x = 12 + (d.index / maxIdx) * (width - 24);
      const y = height / 2 + Math.max(-55, Math.min(55, d.dev)) * 0.9;
      const color = Math.abs(d.dev) <= 20 ? 'var(--ok)' : Math.abs(d.dev) <= 40 ? 'var(--orange)' : 'var(--red)';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}"/>`;
    }).join('');
    const svg = h('div', { class: 'timeline' });
    svg.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Desviación de cada nota (arriba = adelantada, abajo = retrasada)"><line x1="0" x2="${width}" y1="${height / 2}" y2="${height / 2}" stroke="currentColor" opacity=".35"/><line x1="0" x2="${width}" y1="${height / 2 - 18}" y2="${height / 2 - 18}" stroke="currentColor" opacity=".12" stroke-dasharray="4 4"/><line x1="0" x2="${width}" y1="${height / 2 + 18}" y2="${height / 2 + 18}" stroke="currentColor" opacity=".12" stroke-dasharray="4 4"/>${dots}</svg>`;
    const pct = (v) => `${Math.round(v * 100)} %`;
    results.append(
      h('section', { class: 'panel stack' },
        h('div', { class: 'row row--between' }, h('h2', { style: 'margin:0' }, 'Resultado'), h('span', { class: 'pill' }, `${stats.n} notas · ${pct(stats.coverage)} detectadas`)),
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(stats.score)), h('div', { class: 'hint' }, 'Nota de pulso')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${Math.round(stats.sd)}`), h('div', { class: 'hint' }, 'Dispersión (ms)')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, `${stats.mean > 0 ? '+' : ''}${Math.round(stats.mean)}`), h('div', { class: 'hint' }, 'Sesgo medio (ms)')),
          h('div', { class: 'stat' }, h('div', { class: 'big-number' }, pct(stats.within20)), h('div', { class: 'hint' }, 'Dentro de ±20 ms')),
        ),
        h('p', {}, `${timingVerdict(stats)} Ahora ${stats.tendency}.`),
        h('div', { class: 'hist' }, ...bars),
        h('p', { class: 'hint' }, 'Histograma de desviaciones en ms (negativo = adelantado, positivo = retrasado). Las barras verdes están casi exactamente en el clic.'),
        svg,
        h('p', { class: 'hint' }, 'Cada punto es una nota: arriba, adelantada; abajo, retrasada.'),
      ),
    );
  }

  function drawHistory() {
    clear(history);
    const list = ctx.storage.get('timing-history', []);
    if (!list.length) return;
    const last = list.slice(-12);
    const best = Math.max(...list.map((x) => x.score));
    history.append(
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Tus sesiones'),
        h('p', { class: 'hint' }, `Mejor nota: ${best}. Últimas ${last.length} sesiones (de más antigua a más reciente).`),
        h('div', { class: 'spark' }, ...last.map((x) => h('div', { class: 'spark-bar', title: `${x.date} · ${x.bpm} bpm · dispersión ${x.sd} ms`, style: `height:${Math.max(4, x.score)}%` }))),
        button('Borrar historial', { variant: 'ghost', onClick: () => { ctx.storage.set('timing-history', []); drawHistory(); } }),
      ),
    );
  }

  const latencySlider = slider({ min: -50, max: 200, value: cfg.latency, label: 'Latencia', format: (v) => `${v} ms`, onInput: (v) => { cfg.latency = v; ctx.storage.set('timing-latency', v); } });

  root.append(
    header('Practicar', 'Timing Lab', 'Mide tu pulso con el micrófono: toca notas sueltas a tempo y verás la desviación de cada una en milisegundos, tu tendencia a adelantarte o arrastrar y tu progreso.'),
    h('div', { class: 'tool-grid' },
      h('section', { class: 'panel stack' },
        slider({ min: 40, max: 200, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = clampBpm(v); ctx.storage.set('timing-bpm', cfg.bpm); } }),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Notas por pulso'), segmented(SUBS, cfg.sub, (v) => { cfg.sub = Number(v); ctx.storage.set('timing-sub', cfg.sub); })),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Compases'), segmented([2, 4, 8].map((n) => ({ value: n, label: `${n}` })), cfg.bars, (v) => { cfg.bars = Number(v); ctx.storage.set('timing-bars', cfg.bars); })),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Metrónomo'), segmented(CLICK_MODES, cfg.mode, (v) => { cfg.mode = v; ctx.storage.set('timing-mode', v); })),
        latencySlider,
        h('p', { class: 'hint' }, '«Sólo la cuenta» apaga el clic tras un compás: mide si mantienes el pulso tú solo. Usa auriculares para que el clic no se cuele en el micrófono.'),
        h('div', { class: 'row', style: 'justify-content:center' }, startBtn, calBtn),
        status,
      ),
      h('div', { class: 'stack' }, results, history),
    ),
    h('section', { class: 'panel' }, h('h2', {}, 'Cómo usarlo'),
      h('p', { class: 'hint' }, 'Toca notas sueltas con ataque claro (mejor una sola cuerda, sin acordes). Para calibrar la latencia de tu equipo, pulsa «Calibrar», toca una nota justo en cada clic y se guardará tu desfase medio; ese valor se resta de las mediciones. La detección de ataques funciona mejor con guitarra limpia o ligeramente saturada.')),
  );
  drawHistory();
}

export default {
  id: 'timing',
  title: 'Timing Lab',
  group: 'practice',
  icon: '◎',
  summary: 'Mide con el micrófono cuánto te desvías del pulso, en milisegundos.',
  isNew: true,
  mount,
};
