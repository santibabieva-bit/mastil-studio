/**
 * Motor de audio del Lab (WebAudio puro, sin muestras ni dependencias).
 * - Guitarra: síntesis Karplus-Strong precalculada en AudioBuffer.
 * - Batería: ruido/osciladores; bajo y pad sintéticos; clics de metrónomo.
 * - Buses con volumen independiente y un EQ paramétrico global (EQ trainer).
 */

import { midiToFreq } from '../core/music.js';
import { synthPluck } from './pluck.js';

const BUSES = ['guitar', 'drums', 'bass', 'synth', 'click', 'misc'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = {};
    this.pluckCache = new Map();
    this.noise = null;
    this.queue = [];
    this.raf = 0;
    this.listeners = new Set();
    this.playing = new Map();
  }

  /** Debe llamarse desde un gesto del usuario la primera vez. */
  async ensure() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('Este navegador no soporta WebAudio.');
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.eq = this.ctx.createBiquadFilter();
      this.eq.type = 'peaking';
      this.eq.frequency.value = 1000;
      this.eq.Q.value = 1.1;
      this.eq.gain.value = 0;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.eq);
      this.eq.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.comp.connect(this.analyser);
      for (const name of BUSES) {
        const gain = this.ctx.createGain();
        gain.gain.value = name === 'click' ? 0.9 : 0.8;
        gain.connect(this.master);
        this.buses[name] = gain;
      }
      this.noise = this.makeNoise(1.5);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  get time() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setBusVolume(name, value) {
    if (this.buses[name]) this.buses[name].gain.value = value;
  }

  setMaster(value) {
    if (this.master) this.master.gain.value = value;
  }

  setEq({ freq = 1000, gain = 0, q = 1.1 }) {
    if (!this.eq) return;
    this.eq.frequency.value = freq;
    this.eq.gain.value = gain;
    this.eq.Q.value = q;
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  /* ───────────── Eventos visuales sincronizados ───────────── */

  /** Ejecuta `fn` cuando el reloj de audio alcance `time`. */
  at(time, fn) {
    this.queue.push({ time, fn });
    if (!this.raf) this.raf = requestAnimationFrame(() => this.pump());
  }

  pump() {
    this.raf = 0;
    const now = this.time;
    const rest = [];
    for (const item of this.queue) {
      if (item.time <= now) {
        try {
          item.fn();
        } catch (error) {
          console.error(error);
        }
      } else rest.push(item);
    }
    this.queue = rest;
    if (this.queue.length) this.raf = requestAnimationFrame(() => this.pump());
  }

  clearQueue() {
    this.queue = [];
  }

  /** Estado «reproduciendo» por herramienta (para el registro de práctica). */
  notePlaying(tool, on) {
    const before = this.playing.get(tool) ?? 0;
    const next = Math.max(0, before + (on ? 1 : -1));
    this.playing.set(tool, next);
    if ((before === 0) !== (next === 0)) {
      for (const listener of this.listeners) listener(tool, next > 0);
    }
  }

  onPlayState(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ───────────── Guitarra ───────────── */

  pluckBuffer(midi, tone = 'clean') {
    const key = `${midi}:${tone}`;
    if (this.pluckCache.has(key)) return this.pluckCache.get(key);
    const data = synthPluck(this.ctx.sampleRate, midi, tone);
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    this.pluckCache.set(key, buffer);
    return buffer;
  }

  /**
   * @param {number} midi
   * @param {number} time (reloj de audio)
   * @param {object} o { dur, vel, bus, tone, legato, bend, vibrato, harmonic, mute }
   */
  pluck(midi, time, o = {}) {
    const ctx = this.ctx;
    const { dur = 1.6, vel = 0.8, bus = 'guitar', tone = 'clean', legato = false, bend = 0, vibrato = false, harmonic = false, mute = false } = o;
    const target = this.buses[bus] ?? this.buses.guitar;
    const source = ctx.createBufferSource();
    source.buffer = this.pluckBuffer(harmonic ? midi + 12 : midi, tone);
    const gain = ctx.createGain();
    const level = vel * (legato ? 0.6 : 1) * (harmonic ? 0.7 : 1);
    const hold = mute ? 0.07 : dur;
    if (legato) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + 0.012);
    } else {
      gain.gain.setValueAtTime(level, time);
    }
    gain.gain.setValueAtTime(level, time + Math.max(0.01, hold));
    gain.gain.exponentialRampToValueAtTime(0.0005, time + hold + (mute ? 0.04 : 0.25));
    if (bend) {
      source.playbackRate.setValueAtTime(1, time);
      source.playbackRate.linearRampToValueAtTime(2 ** (bend / 12), time + Math.min(0.25, hold * 0.6));
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.4;
      depth.gain.value = 22;
      lfo.connect(depth);
      depth.connect(source.detune);
      lfo.start(time + hold * 0.3);
      lfo.stop(time + hold + 0.3);
    }
    source.connect(gain);
    gain.connect(target);
    source.start(time);
    source.stop(time + hold + 0.4);
    return source;
  }

  /** Rasgueo: notas escalonadas en el tiempo. */
  strum(midis, time, o = {}) {
    const { down = true, spread = 0.018, vel = 0.7, bus = 'guitar', dur = 1.4, tone = 'clean', mute = false } = o;
    const list = down ? [...midis] : [...midis].reverse();
    list.forEach((midi, i) => {
      this.pluck(midi, time + i * spread, {
        dur,
        vel: vel * (down ? 1 : 0.8) * (1 - i * 0.02),
        bus,
        tone,
        mute,
      });
    });
  }

  /* ───────────── Metrónomo ───────────── */

  click(time, { accent = false, sound = 'click', vol = 1 } = {}) {
    const ctx = this.ctx;
    const bus = this.buses.click;
    const gain = ctx.createGain();
    gain.connect(bus);
    if (sound === 'cowbell') {
      for (const f of [560, 845]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f * (accent ? 1.25 : 1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 800;
        osc.connect(bp);
        bp.connect(gain);
        osc.start(time);
        osc.stop(time + 0.2);
      }
      gain.gain.setValueAtTime(0.35 * vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      return;
    }
    const osc = ctx.createOscillator();
    const cfg = {
      click: { type: 'square', hi: 2000, lo: 1300, len: 0.035 },
      wood: { type: 'sine', hi: 1250, lo: 900, len: 0.06 },
      beep: { type: 'sine', hi: 1320, lo: 880, len: 0.09 },
      hat: { type: 'noise', hi: 0, lo: 0, len: 0.05 },
    }[sound] ?? { type: 'square', hi: 2000, lo: 1300, len: 0.035 };
    if (cfg.type === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = accent ? 6000 : 8500;
      src.connect(hp);
      hp.connect(gain);
      src.start(time);
      src.stop(time + cfg.len + 0.02);
    } else {
      osc.type = cfg.type;
      osc.frequency.value = accent ? cfg.hi : cfg.lo;
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + cfg.len + 0.02);
    }
    const peak = (accent ? 0.9 : 0.6) * vol * (cfg.type === 'square' ? 0.5 : 1);
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + cfg.len);
  }

  /* ───────────── Batería ───────────── */

  drum(name, time, vel = 1) {
    const ctx = this.ctx;
    const bus = this.buses.drums;
    const out = ctx.createGain();
    out.connect(bus);
    if (name === 'kick') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
      out.gain.setValueAtTime(1.0 * vel, time);
      out.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
      osc.connect(out);
      osc.start(time);
      osc.stop(time + 0.4);
    } else if (name === 'snare') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.75 * vel, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(out);
      src.start(time);
      src.stop(time + 0.25);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, time);
      osc.frequency.exponentialRampToValueAtTime(150, time + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5 * vel, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(og);
      og.connect(out);
      osc.start(time);
      osc.stop(time + 0.15);
      out.gain.value = 1;
    } else if (name === 'hat' || name === 'openhat') {
      const open = name === 'openhat';
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const len = open ? 0.32 : 0.045;
      out.gain.setValueAtTime(0.38 * vel, time);
      out.gain.exponentialRampToValueAtTime(0.001, time + len);
      src.connect(hp);
      hp.connect(out);
      src.start(time);
      src.stop(time + len + 0.02);
    } else if (name === 'crash') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      out.gain.setValueAtTime(0.5 * vel, time);
      out.gain.exponentialRampToValueAtTime(0.001, time + 1.4);
      src.connect(hp);
      hp.connect(out);
      src.start(time);
      src.stop(time + 1.45);
    } else if (name === 'tom') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(95, time + 0.2);
      out.gain.setValueAtTime(0.8 * vel, time);
      out.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      osc.connect(out);
      osc.start(time);
      osc.stop(time + 0.32);
    }
  }

  /* ───────────── Bajo y sintetizador ───────────── */

  bass(midi, time, dur = 0.4, vel = 0.8) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(midi);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, time);
    lp.frequency.exponentialRampToValueAtTime(260, time + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.55 * vel, time + 0.01);
    gain.gain.setValueAtTime(0.5 * vel, time + Math.max(0.02, dur - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur + 0.05);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(gain);
    gain.connect(this.buses.bass);
    osc.start(time);
    sub.start(time);
    osc.stop(time + dur + 0.1);
    sub.stop(time + dur + 0.1);
  }

  pad(midis, time, dur = 2, vel = 0.5) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.16 * vel, time + Math.min(0.25, dur * 0.4));
    gain.gain.setValueAtTime(0.16 * vel, time + Math.max(0.3, dur - 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.connect(gain);
    gain.connect(this.buses.synth);
    for (const midi of midis) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(midi);
        osc.detune.value = detune;
        osc.connect(lp);
        osc.start(time);
        osc.stop(time + dur + 0.4);
      }
    }
  }

  /** Piano sencillo (aditivo) para el entrenador de oído. */
  piano(midi, time, dur = 1.2, vel = 0.7, bus = 'misc') {
    const ctx = this.ctx;
    const wave = ctx.createPeriodicWave(
      new Float32Array([0, 0, 0, 0, 0, 0]),
      new Float32Array([0, 1, 0.5, 0.3, 0.16, 0.08]),
    );
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.5 * vel, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur + 0.6);
    osc.connect(gain);
    gain.connect(this.buses[bus]);
    osc.start(time);
    osc.stop(time + dur + 0.7);
  }

  /**
   * Tono sostenido con control de frecuencia (vibrato trainer, tuner).
   * Devuelve { set(freq,time), stop(time) }.
   */
  sustain(freq, time, { type = 'sawtooth', drive = 0, vol = 0.25, bus = 'misc' } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = drive > 0 ? 3200 : 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.04);
    let tail = lp;
    if (drive > 0) {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(512);
      const k = drive * 40;
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
      }
      shaper.curve = curve;
      lp.connect(shaper);
      tail = shaper;
    }
    osc.connect(lp);
    tail.connect(gain);
    gain.connect(this.buses[bus]);
    osc.start(time);
    return {
      osc,
      set: (f, t) => osc.frequency.setValueAtTime(f, t),
      ramp: (f, t) => osc.frequency.linearRampToValueAtTime(f, t),
      stop: (t) => {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
        osc.stop(t + 0.08);
      },
    };
  }

  /** Tono puro de referencia (afinador). */
  referenceTone(freq, seconds = 2) {
    const t = this.time + 0.02;
    const tone = this.sustain(freq, t, { type: 'triangle', vol: 0.3 });
    tone.stop(t + seconds);
  }
}

export const engine = new AudioEngine();
