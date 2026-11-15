/**
 * Micrófono: abre la entrada sin procesado y ofrece (a) un analizador para
 * detectar la altura en directo y (b) un grabador de muestras con marca de
 * tiempo del reloj de audio, para medir el pulso contra el metrónomo.
 */

export async function openMic(engine, { fftSize = 4096 } = {}) {
  await engine.ensure();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = engine.ctx.createMediaStreamSource(stream);
  const analyser = engine.ctx.createAnalyser();
  analyser.fftSize = fftSize;
  source.connect(analyser);
  return {
    stream,
    source,
    analyser,
    close() {
      try { source.disconnect(); } catch { /* ya desconectado */ }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * Graba la señal del micro. `stop()` devuelve
 * { samples, sampleRate, startTime } con startTime en segundos del AudioContext.
 */
export function createRecorder(engine, source, { bufferSize = 2048 } = {}) {
  const ctx = engine.ctx;
  const node = ctx.createScriptProcessor(bufferSize, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const chunks = [];
  let startTime = null;
  let on = false;
  let total = 0;
  const marks = [];
  node.onaudioprocess = (event) => {
    if (!on) return;
    // playbackTime es el instante de salida del bloque, un buffer después de capturarlo.
    const blockStart = event.playbackTime - (2 * event.inputBuffer.length) / ctx.sampleRate;
    if (startTime === null) startTime = blockStart;
    // Cada bloque lleva su propio instante: si el navegador pierde alguno, el mapa de tiempos no se desvía.
    marks.push({ sample: total, time: blockStart });
    total += event.inputBuffer.length;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return {
    start() { chunks.length = 0; marks.length = 0; total = 0; startTime = null; on = true; },
    stop() {
      on = false;
      const length = chunks.reduce((a, c) => a + c.length, 0);
      const samples = new Float32Array(length);
      let offset = 0;
      for (const c of chunks) { samples.set(c, offset); offset += c.length; }
      const sampleRate = ctx.sampleRate;
      const frozen = marks.slice();
      /** Segundos desde el primer sample → tiempo del AudioContext. */
      const toContextTime = (seconds) => {
        const index = seconds * sampleRate;
        let mark = frozen[0];
        for (const m of frozen) { if (m.sample <= index) mark = m; else break; }
        return mark ? mark.time + (index - mark.sample) / sampleRate : (startTime ?? 0) + seconds;
      };
      return { samples, sampleRate, startTime: startTime ?? ctx.currentTime, toContextTime };
    },
    dispose() {
      on = false;
      try { source.disconnect(node); node.disconnect(); mute.disconnect(); } catch { /* ya desconectado */ }
    },
  };
}

/** Nivel RMS rápido de un buffer del analizador (para el vúmetro). */
export function level(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}
