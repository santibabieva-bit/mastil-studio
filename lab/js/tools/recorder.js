/**
 * Autograbación: graba audio (o audio y vídeo) mientras tocas y revísalo
 * después a velocidad reducida con la forma de onda para detectar notas
 * sucias, tensión o pulso irregular. Las tomas viven sólo en esta pestaña.
 */

import { button, clear, h, segmented } from '../ui/dom.js';
import { header } from './common.js';

const RATES = [
  { value: 0.5, label: '50 %' },
  { value: 0.75, label: '75 %' },
  { value: 1, label: '100 %' },
];

function mount(root, ctx) {
  const state = { video: false, rate: 0.75, recording: false, takes: [], selected: -1 };
  let stream = null;
  let media = null;
  let chunks = [];
  let startedAt = 0;
  let tick = 0;
  const clock = h('div', { class: 'big-number', style: 'text-align:center' }, '00:00');
  const status = h('p', { class: 'hint', style: 'text-align:center' }, 'Pulsa «Grabar», toca y luego revisa tu toma a velocidad lenta.');
  const recBtn = button('● Grabar', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: toggle });
  const takesBox = h('div', { class: 'stack' });
  const viewer = h('div', { class: 'stack' });

  ctx.onCleanup(() => {
    clearInterval(tick);
    stopStream();
    state.takes.forEach((t) => URL.revokeObjectURL(t.url));
  });

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function toggle() {
    if (state.recording) { media.stop(); return; }
    if (!window.MediaRecorder) { status.textContent = 'Este navegador no soporta grabación (MediaRecorder).'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: state.video });
    } catch {
      status.textContent = 'No he podido acceder al micrófono o la cámara. Revisa los permisos (HTTPS o localhost).';
      return;
    }
    chunks = [];
    media = new MediaRecorder(stream);
    media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    media.onstop = async () => {
      clearInterval(tick);
      const seconds = (performance.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: media.mimeType || (state.video ? 'video/webm' : 'audio/webm') });
      stopStream();
      state.recording = false;
      recBtn.textContent = '● Grabar';
      recBtn.classList.remove('is-running');
      const take = { id: Date.now(), blob, url: URL.createObjectURL(blob), video: state.video, seconds, peaks: null };
      state.takes.unshift(take);
      state.takes = state.takes.slice(0, 5).filter((t, i) => { if (i >= 5) URL.revokeObjectURL(t.url); return true; });
      ctx.logSeconds(Math.round(seconds));
      state.selected = 0;
      status.textContent = 'Toma guardada. Revísala abajo.';
      await computePeaks(take);
      drawTakes();
      drawViewer();
    };
    media.start();
    state.recording = true;
    startedAt = performance.now();
    recBtn.textContent = '■ Parar';
    recBtn.classList.add('is-running');
    status.textContent = 'Grabando…';
    tick = setInterval(() => {
      const s = Math.floor((performance.now() - startedAt) / 1000);
      clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
  }

  async function computePeaks(take) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const data = await audioCtx.decodeAudioData(await take.blob.arrayBuffer());
      const ch = data.getChannelData(0);
      const bins = 600;
      const size = Math.max(1, Math.floor(ch.length / bins));
      take.peaks = Array.from({ length: bins }, (_, i) => {
        let max = 0;
        for (let k = 0; k < size; k += 1) max = Math.max(max, Math.abs(ch[i * size + k] ?? 0));
        return max;
      });
      take.duration = data.duration;
      audioCtx.close();
    } catch {
      take.peaks = null;
    }
  }

  function drawTakes() {
    clear(takesBox);
    if (!state.takes.length) return;
    takesBox.append(h('h2', {}, 'Tus tomas'), h('div', { class: 'pills' }, ...state.takes.map((t, i) => {
      const b = h('button', { type: 'button', class: `pill pill-btn ${i === state.selected ? 'is-active' : ''}` }, `${t.video ? '🎥' : '🎧'} Toma ${state.takes.length - i} · ${Math.round(t.seconds)} s`);
      b.addEventListener('click', () => { state.selected = i; drawTakes(); drawViewer(); });
      return b;
    })));
  }

  function drawViewer() {
    clear(viewer);
    const take = state.takes[state.selected];
    if (!take) return;
    const el = h(take.video ? 'video' : 'audio', { src: take.url, controls: true, preload: 'auto', style: take.video ? 'width:100%;max-height:320px;border-radius:12px' : 'width:100%' });
    el.preservesPitch = true;
    el.playbackRate = state.rate;
    const canvas = h('canvas', { width: 900, height: 120, class: 'wave', style: 'width:100%;height:120px;cursor:pointer', 'aria-label': 'Forma de onda: clic para saltar' });
    function paint() {
      const c = canvas.getContext('2d');
      const w = canvas.width;
      const ht = canvas.height;
      c.clearRect(0, 0, w, ht);
      const fg = getComputedStyle(canvas).color || '#888';
      c.fillStyle = fg;
      c.globalAlpha = 0.55;
      if (take.peaks) {
        const n = take.peaks.length;
        take.peaks.forEach((p, i) => {
          const bh = Math.max(1, p * ht * 0.95);
          c.fillRect((i / n) * w, (ht - bh) / 2, Math.max(1, w / n - 0.5), bh);
        });
      }
      c.globalAlpha = 1;
      const dur = el.duration || take.duration || take.seconds;
      if (dur) {
        const x = (el.currentTime / dur) * w;
        c.fillStyle = '#d9822b';
        c.fillRect(x - 1, 0, 2, ht);
      }
    }
    el.addEventListener('timeupdate', paint);
    el.addEventListener('loadedmetadata', paint);
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const dur = el.duration || take.duration;
      if (dur && Number.isFinite(dur)) el.currentTime = ((e.clientX - r.left) / r.width) * dur;
    });
    viewer.append(
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Revisión'),
        take.video ? el : null,
        canvas,
        take.video ? null : el,
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Velocidad de revisión (mismo tono)'), segmented(RATES, state.rate, (v) => { state.rate = Number(v); el.playbackRate = state.rate; })),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-outline', href: take.url, download: `toma-${take.id}.${take.video ? 'webm' : 'webm'}` }, 'Descargar toma'),
          button('Borrar toma', { variant: 'ghost', onClick: () => { URL.revokeObjectURL(take.url); state.takes.splice(state.selected, 1); state.selected = state.takes.length ? 0 : -1; drawTakes(); drawViewer(); } }),
        ),
        h('p', { class: 'hint' }, 'Mira la forma de onda: ataques irregulares, notas que no se apagan y picos desiguales delatan problemas de pulso, silenciado o fuerza.'),
      ),
    );
    paint();
  }

  root.append(
    header('Practicar', 'Autograbación', 'Grábate tocando (audio o vídeo) y revisa la toma a media velocidad con la forma de onda. Es la manera más rápida de ver lo que no notas mientras tocas.'),
    h('section', { class: 'panel stack' },
      clock,
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Formato'), segmented([{ value: 'audio', label: 'Audio' }, { value: 'video', label: 'Audio y vídeo' }], 'audio', (v) => { state.video = v === 'video'; })),
      h('div', { class: 'row', style: 'justify-content:center' }, recBtn),
      status,
    ),
    takesBox,
    viewer,
    h('p', { class: 'hint' }, 'Las tomas no se envían a ningún sitio y se pierden al cerrar la pestaña: descarga las que quieras conservar.'),
  );
}

export default {
  id: 'recorder',
  title: 'Autograbación',
  group: 'practice',
  icon: '●',
  summary: 'Grábate tocando y revisa la toma a velocidad lenta con forma de onda.',
  isNew: true,
  mount,
};
