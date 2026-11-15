/** Guitar Tuner: afinador por micrófono con detección automática de cuerda y notas de referencia. */

import { TUNINGS, midiName, midiToFreq, prettyNote } from '../core/music.js';
import { detectPitch, nearestNote, nearestString } from '../core/pitch.js';
import { button, clear, h, select } from '../ui/dom.js';
import { header } from './common.js';

function mount(root, ctx) {
  const { engine } = ctx;
  const state = { tuning: ctx.storage.get('tuner-tuning', 'standard'), running: false, manual: null };
  let stream = null;
  let analyser = null;
  let raf = 0;
  let smooth = null;
  const buf = new Float32Array(4096);

  const noteOut = h('div', { class: 'tuner-note' }, '–');
  const freqOut = h('p', { class: 'hint', style: 'text-align:center' }, 'Pulsa «Activar micrófono» y toca una cuerda al aire.');
  const needle = h('div', { class: 'needle' });
  const meter = h('div', { class: 'tuner-meter', role: 'img', 'aria-label': 'Medidor de afinación' }, h('div', { class: 'mid' }), needle);
  const centsOut = h('div', { class: 'tempo-name', style: 'text-align:center' }, '');
  const chips = h('div', { class: 'row', style: 'justify-content:center' });
  const micBtn = button('🎤 Activar micrófono', { variant: 'accent', onClick: toggleMic, attrs: { class: 'btn btn-accent btn-lg' } });

  const tuning = () => TUNINGS[state.tuning]?.midi ?? TUNINGS.standard.midi;

  function drawChips(activeIndex = -1, inTune = false) {
    clear(chips);
    // De la 6ª a la 1ª (de grave a aguda), como se afina.
    const list = tuning();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const chip = h('button', { type: 'button', class: `string-chip ${i === activeIndex ? (inTune ? 'is-ok' : 'is-target') : ''}`, title: `Oír ${prettyNote(midiName(list[i]))} de referencia` }, prettyNote(midiName(list[i]).replace(/\d+$/, '')));
      chip.addEventListener('click', async () => {
        await engine.ensure();
        engine.referenceTone(midiToFreq(list[i]), 2.5);
        state.manual = i;
        setTimeout(() => { state.manual = null; }, 4000);
      });
      chips.append(chip);
    }
  }

  async function toggleMic() {
    if (state.running) return stopMic();
    try {
      await engine.ensure();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      freqOut.textContent = 'No he podido acceder al micrófono. Revisa los permisos del navegador (necesita HTTPS o localhost).';
      return;
    }
    const source = engine.ctx.createMediaStreamSource(stream);
    analyser = engine.ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    state.running = true;
    micBtn.textContent = '■ Parar';
    engine.notePlaying('tuner', true);
    loop();
  }

  function stopMic() {
    state.running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    micBtn.textContent = '🎤 Activar micrófono';
    engine.notePlaying('tuner', false);
    noteOut.textContent = '–';
    centsOut.textContent = '';
    needle.style.left = '50%';
    drawChips();
  }
  ctx.onCleanup(stopMic);

  function loop() {
    if (!state.running) return;
    analyser.getFloatTimeDomainData(buf);
    const freq = detectPitch(buf, engine.ctx.sampleRate, { minFreq: 40, maxFreq: 1000 });
    if (freq) {
      smooth = smooth ? smooth * 0.6 + freq * 0.4 : freq;
      const list = tuning();
      const near = nearestString(smooth, list);
      const note = nearestNote(smooth);
      const cents = near.cents;
      noteOut.textContent = prettyNote(note.name);
      freqOut.textContent = `${smooth.toFixed(1)} Hz · cuerda ${list.length - near.index} (${prettyNote(midiName(near.targetMidi))})`;
      const clamped = Math.max(-50, Math.min(50, cents));
      needle.style.left = `${50 + clamped}%`;
      const inTune = Math.abs(cents) <= 5;
      centsOut.textContent = inTune ? '✓ AFINADA' : cents > 0 ? `${cents} ¢ · demasiado AGUDA (afloja)` : `${cents} ¢ · demasiado GRAVE (tensa)`;
      drawChips(near.index, inTune);
    } else {
      smooth = null;
    }
    raf = requestAnimationFrame(loop);
  }

  const sel = select(Object.values(TUNINGS).filter((t) => t.midi.length <= 7).map((t) => ({ value: t.id, label: t.label })), state.tuning, (v) => {
    state.tuning = v;
    ctx.storage.set('tuner-tuning', v);
    drawChips();
  });

  root.append(
    header('Oído y afinación', 'Guitar Tuner', 'Afinador por micrófono: detecta la cuerda automáticamente y te dice si estás agudo o grave. También sirve para bajo. Pulsa una cuerda para oír la nota de referencia.'),
    h('div', { class: 'tool-grid tool-grid--rev' },
      h('section', { class: 'panel stack' }, noteOut, meter, centsOut, freqOut, chips, h('div', { class: 'row', style: 'justify-content:center' }, micBtn)),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Afinación'), h('div', { class: 'field' }, h('label', {}, 'Instrumento / afinación'), sel),
        h('p', { class: 'hint' }, 'El audio del micrófono se procesa únicamente en tu navegador; no se envía ni se graba en ningún sitio.'),
        h('p', { class: 'hint' }, 'Consejo: toca la cuerda al aire con fuerza media y deja que suene; ajusta hasta que la aguja quede en el centro.'),
      ),
    ),
  );
  drawChips();
}

export default {
  id: 'tuner',
  title: 'Guitar Tuner',
  group: 'ears',
  icon: '◎',
  summary: 'Afinador por micrófono con detección de cuerda, afinaciones alternativas y notas de referencia.',
  isNew: true,
  mount,
};
