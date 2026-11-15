/**
 * Audio Lab: practica con tus propias grabaciones o canciones (archivos
 * locales). Velocidad de 25 % a 150 % sin cambiar el tono, bucle A-B,
 * subida automática de velocidad en cada vuelta, cuenta previa y marcadores.
 * Nada se sube a ningún sitio: el archivo se reproduce en tu navegador.
 */

import { chordsFromChroma, chromagram, dominantNotes } from '../core/chroma.js';
import { button, clear, h, slider, toggle } from '../ui/dom.js';
import { header } from './common.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

function mount(root, ctx) {
  const { engine } = ctx;
  const st = {
    name: '', key: '', duration: 0, a: null, b: null, loop: true, rate: 1,
    ramp: { on: false, step: 5, max: 100 }, countIn: { on: false, bpm: 80, beats: 4 }, markers: [], peaks: null, busy: false,
  };
  const audio = new Audio();
  audio.preload = 'auto';
  const setPitchLock = () => { audio.preservesPitch = true; audio.webkitPreservesPitch = true; audio.mozPreservesPitch = true; };
  setPitchLock();
  let url = '';
  let poll = 0;
  let playing = false;
  let countTimer = 0;

  const canvas = h('canvas', { width: 1000, height: 120, style: 'width:100%;height:120px;border-radius:10px;background:#fffdf8;border:1px solid var(--line);cursor:pointer', role: 'img', 'aria-label': 'Forma de onda: pulsa para ir a ese punto' });
  const timeEl = h('div', { class: 'big-number', style: 'text-align:center;font-size:1.8rem' }, '0:00.0');
  const info = h('p', { class: 'hint', style: 'text-align:center' }, 'Elige un archivo de audio (mp3, wav, m4a, ogg…) o de vídeo para empezar.');
  const markersEl = h('div', { class: 'stack' });
  const analysisEl = h('div', { class: 'stack' });
  const loopInfo = h('p', { class: 'hint' }, '');
  const controls = h('div', { class: 'stack' });
  const playBtn = button('▶ Reproducir', { variant: 'accent', onClick: togglePlay, attrs: { class: 'btn btn-accent btn-lg', disabled: true } });
  let rateSlider;

  const clearCount = () => { clearTimeout(countTimer); countTimer = 0; };
  ctx.onCleanup(() => { clearInterval(poll); clearCount(); audio.pause(); audio.removeAttribute('src'); if (url) URL.revokeObjectURL(url); engine.notePlaying('audiolab', false); });

  function setPlaying(on) {
    if (on === playing) return;
    playing = on;
    playBtn.textContent = on ? '■ Pausar' : '▶ Reproducir';
    engine.notePlaying('audiolab', on);
  }
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));

  async function playFrom(time, withCount = false) {
    clearCount();
    audio.currentTime = Math.max(0, time);
    if (withCount && st.countIn.on) {
      await engine.ensure();
      const beat = 60 / st.countIn.bpm;
      audio.pause();
      for (let i = 0; i < st.countIn.beats; i += 1) engine.click(engine.time + 0.05 + i * beat, { accent: i === 0, sound: 'wood', vol: 1 });
      countTimer = setTimeout(() => audio.play().catch(() => {}), (0.05 + st.countIn.beats * beat) * 1000);
      return;
    }
    audio.play().catch(() => {});
  }

  function togglePlay() {
    if (!st.duration) return;
    if (playing || countTimer) { clearCount(); audio.pause(); return; }
    const start = st.a != null && (audio.currentTime < st.a || (st.b != null && audio.currentTime >= st.b)) ? st.a : audio.currentTime;
    playFrom(start, st.a != null);
  }

  function tick() {
    timeEl.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(st.duration || 0)}`;
    if (st.loop && st.a != null && st.b != null && st.b > st.a && playing && audio.currentTime >= st.b) {
      if (st.ramp.on && st.rate * 100 < st.ramp.max) {
        st.rate = Math.min(st.ramp.max / 100, st.rate + st.ramp.step / 100);
        audio.playbackRate = st.rate;
        rateSlider?.setValue(Math.round(st.rate * 100));
      }
      playFrom(st.a, true);
    }
    drawWave();
  }

  function drawWave() {
    const c = canvas.getContext('2d');
    const w = canvas.width;
    const hh = canvas.height;
    c.clearRect(0, 0, w, hh);
    c.fillStyle = '#fffdf8';
    c.fillRect(0, 0, w, hh);
    const dur = st.duration || 1;
    const x = (t) => (t / dur) * w;
    if (st.a != null && st.b != null) {
      c.fillStyle = 'rgba(223,129,47,0.18)';
      c.fillRect(x(st.a), 0, x(st.b) - x(st.a), hh);
    }
    if (st.peaks) {
      c.fillStyle = '#17251f';
      const n = st.peaks.length;
      for (let i = 0; i < n; i += 1) {
        const peak = st.peaks[i] * (hh / 2 - 4);
        c.fillRect((i / n) * w, hh / 2 - peak, Math.max(1, w / n - 0.5), peak * 2 || 1);
      }
    } else {
      c.fillStyle = '#d9cfbc';
      c.fillRect(0, hh / 2 - 1, w, 2);
    }
    for (const m of st.markers) {
      c.fillStyle = '#3b73c9';
      c.fillRect(x(m.t) - 1, 0, 2, hh);
    }
    for (const [t, color] of [[st.a, '#3f8f5a'], [st.b, '#d84a3e']]) {
      if (t == null) continue;
      c.fillStyle = color;
      c.fillRect(x(t) - 1.5, 0, 3, hh);
    }
    c.fillStyle = '#df812f';
    c.fillRect(x(audio.currentTime) - 1, 0, 2, hh);
  }

  canvas.addEventListener('click', (e) => {
    if (!st.duration) return;
    const rect = canvas.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * st.duration;
    tick();
  });

  async function loadFile(file) {
    if (!file) return;
    clearCount();
    audio.pause();
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    st.name = file.name;
    st.key = `${file.name}:${file.size}`;
    st.a = null; st.b = null; st.peaks = null; st.buffer = null;
    st.markers = ctx.storage.get('audiolab-markers', {})[st.key] ?? [];
    audio.src = url;
    setPitchLock();
    audio.playbackRate = st.rate;
    info.textContent = `Cargando «${file.name}»…`;
    await new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', resolve, { once: true });
    });
    st.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!st.duration) { info.textContent = 'No he podido leer ese archivo.'; return; }
    playBtn.disabled = false;
    info.textContent = `${file.name} · ${fmtTime(st.duration)}`;
    drawMarkers();
    drawLoopInfo();
    tick();
    // Forma de onda (si el archivo no es enorme).
    if (file.size < 80 * 1024 * 1024) {
      try {
        await engine.ensure();
        const buffer = await engine.ctx.decodeAudioData(await file.arrayBuffer());
        st.buffer = buffer;
        const channel = buffer.getChannelData(0);
        const bins = 500;
        const size = Math.max(1, Math.floor(channel.length / bins));
        const peaks = new Float32Array(bins);
        for (let i = 0; i < bins; i += 1) {
          let max = 0;
          for (let k = 0; k < size; k += Math.max(1, Math.floor(size / 40))) max = Math.max(max, Math.abs(channel[i * size + k] ?? 0));
          peaks[i] = max;
        }
        const top = Math.max(...peaks) || 1;
        st.peaks = peaks.map((p) => p / top);
        drawWave();
      } catch { /* sin forma de onda: no es esencial */ }
    }
  }

  function saveMarkers() {
    const all = ctx.storage.get('audiolab-markers', {});
    all[st.key] = st.markers;
    ctx.storage.set('audiolab-markers', all);
  }

  /** Región (en segundos) que se analiza: el bucle A–B o 16 s desde la posición actual. */
  function analysisRange() {
    const start = st.a ?? audio.currentTime;
    const end = st.b ?? Math.min(st.duration, start + 16);
    return { start, end: Math.min(end, start + 32) };
  }

  async function analyze(sliced) {
    clear(analysisEl);
    if (!st.buffer) { analysisEl.append(h('p', { class: 'hint' }, 'Carga un archivo (y espera a que aparezca la forma de onda) para poder analizarlo.')); return; }
    analysisEl.append(h('p', { class: 'hint' }, 'Analizando…'));
    await new Promise((r) => setTimeout(r, 30));
    const sr = st.buffer.sampleRate;
    const mono = st.buffer.getChannelData(0);
    const { start, end } = analysisRange();
    const slices = sliced ? Math.min(16, Math.max(1, Math.floor((end - start) / 2))) : 1;
    const len = (end - start) / slices;
    const rows = [];
    for (let i = 0; i < slices; i += 1) {
      const from = Math.floor((start + i * len) * sr);
      const to = Math.floor((start + (i + 1) * len) * sr);
      const chroma = chromagram(mono, sr, { from, to });
      rows.push({ t: start + i * len, chords: chordsFromChroma(chroma, { top: 3 }), notes: dominantNotes(chroma, { top: 4 }) });
      if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
    clear(analysisEl);
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (!sliced) {
      const r = rows[0];
      analysisEl.append(
        h('p', {}, `Acorde más probable: ${r.chords[0].name} (también ${r.chords.slice(1).map((c) => c.name).join(', ')}).`),
        h('p', { class: 'hint' }, `Notas dominantes: ${r.notes.map((n) => `${n.name} ${Math.round(n.share * 100)} %`).join(' · ')}.`),
      );
    } else {
      analysisEl.append(
        h('div', { class: 'pills' }, ...rows.map((r) => h('span', { class: 'pill', title: `desde ${fmt(r.t)}` }, `${fmt(r.t)} · ${r.chords[0].name}`))),
        h('p', { class: 'hint' }, 'Un acorde por cada ~2 s. Compáralos con lo que oyes y corrige a mano.'),
      );
    }
  }

  function drawMarkers() {
    clear(markersEl);
    if (!st.markers.length) { markersEl.append(h('p', { class: 'hint' }, 'Marca el comienzo de las partes (estrofa, solo, puente…) para saltar a ellas.')); return; }
    st.markers.sort((x, y) => x.t - y.t);
    for (const m of st.markers) {
      markersEl.append(h('div', { class: 'row row--between' },
        h('button', { type: 'button', class: 'text-button', onclick: () => { audio.currentTime = m.t; tick(); } }, `${fmtTime(m.t)} · ${m.label}`),
        h('div', { class: 'row' },
          button('Bucle desde aquí', { variant: 'ghost', onClick: () => { const next = st.markers.find((x) => x.t > m.t); st.a = m.t; st.b = next ? next.t : st.duration; drawLoopInfo(); drawWave(); } }),
          button('Quitar', { variant: 'ghost', onClick: () => { st.markers = st.markers.filter((x) => x !== m); saveMarkers(); drawMarkers(); drawWave(); } }),
        ),
      ));
    }
  }

  function drawLoopInfo() {
    loopInfo.textContent = st.a == null && st.b == null ? 'Sin bucle: marca A y B para repetir un pasaje.' : `Bucle: ${st.a != null ? fmtTime(st.a) : '—'} → ${st.b != null ? fmtTime(st.b) : '—'}`;
  }

  function drawControls() {
    clear(controls);
    rateSlider = slider({ min: 25, max: 150, step: 5, value: Math.round(st.rate * 100), label: 'Velocidad', format: (v) => `${v} %`, onInput: (v) => { st.rate = v / 100; audio.playbackRate = st.rate; } });
    controls.append(
      h('section', { class: 'panel stack' }, h('h2', {}, 'Velocidad y bucle'),
        rateSlider,
        h('div', { class: 'row' },
          ...[50, 75, 90, 100].map((v) => button(`${v} %`, { variant: 'outline', onClick: () => { st.rate = v / 100; audio.playbackRate = st.rate; rateSlider.setValue(v); } })),
        ),
        h('div', { class: 'row' },
          button('Marcar A', { variant: 'outline', onClick: () => { st.a = audio.currentTime; if (st.b != null && st.b <= st.a) st.b = null; drawLoopInfo(); drawWave(); } }),
          button('Marcar B', { variant: 'outline', onClick: () => { st.b = audio.currentTime; if (st.a == null || st.a >= st.b) st.a = Math.max(0, st.b - 4); drawLoopInfo(); drawWave(); } }),
          button('Borrar bucle', { variant: 'ghost', onClick: () => { st.a = null; st.b = null; drawLoopInfo(); drawWave(); } }),
        ),
        loopInfo,
        toggle('Repetir el bucle', st.loop, (v) => { st.loop = v; }),
        toggle('Subir la velocidad en cada vuelta', st.ramp.on, (v) => { st.ramp.on = v; }),
        slider({ min: 1, max: 15, value: st.ramp.step, label: 'Cada vuelta', format: (v) => `+${v} %`, onInput: (v) => { st.ramp.step = v; } }),
        slider({ min: 50, max: 150, step: 5, value: st.ramp.max, label: 'Hasta', format: (v) => `${v} %`, onInput: (v) => { st.ramp.max = v; } }),
        toggle('Cuenta previa antes de cada vuelta', st.countIn.on, (v) => { st.countIn.on = v; }),
        slider({ min: 40, max: 200, value: st.countIn.bpm, label: 'Pulso de la cuenta', format: (v) => `${v} bpm`, onInput: (v) => { st.countIn.bpm = v; } }),
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Marcadores'),
        h('div', { class: 'row' }, button('+ Marcar aquí', { variant: 'accent', onClick: () => {
          if (!st.duration) return;
          st.markers.push({ t: audio.currentTime, label: `Parte ${st.markers.length + 1}` });
          saveMarkers();
          drawMarkers();
          drawWave();
        } })),
        markersEl,
      ),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Transcripción asistida'),
        h('p', { class: 'hint' }, 'Analiza el tramo A–B (o los 16 s desde donde estás) y sugiere los acordes y las notas dominantes. Es una ayuda para tu oído: funciona mejor con música poco densa y puede equivocarse.'),
        h('div', { class: 'row' }, button('Analizar acorde del tramo', { variant: 'accent', onClick: () => analyze(false) }), button('Progresión aproximada', { variant: 'outline', onClick: () => analyze(true) })),
        analysisEl,
      ),
    );
  }

  const fileInput = h('input', { type: 'file', accept: 'audio/*,video/*', hidden: true, onchange: (e) => loadFile(e.target.files?.[0]) });
  root.append(
    header('Practicar', 'Audio Lab', 'Practica con tu propia música: ralentiza sin cambiar el tono, repite un pasaje, sube la velocidad poco a poco y marca las partes. El archivo no sale de tu navegador.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' },
        h('div', { class: 'row' }, h('label', { class: 'btn btn-dark' }, 'Elegir archivo…', fileInput), playBtn),
        info,
        timeEl,
        canvas,
        h('p', { class: 'hint' }, 'Pulsa la onda para saltar. Verde = A, rojo = B, azul = marcadores.'),
      ),
      controls,
    ),
  );
  drawControls();
  drawWave();
  poll = setInterval(() => { if (st.duration) tick(); }, 80);
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));
  function onKey(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'a' || e.key === 'A') { st.a = audio.currentTime; drawLoopInfo(); }
    else if (e.key === 'b' || e.key === 'B') { st.b = audio.currentTime; drawLoopInfo(); }
  }
}

export default {
  id: 'audiolab',
  title: 'Audio Lab',
  group: 'practice',
  icon: '◐',
  summary: 'Tus canciones o grabaciones: velocidad sin cambiar el tono, bucle A-B, subida progresiva y marcadores.',
  isNew: true,
  mount,
};
