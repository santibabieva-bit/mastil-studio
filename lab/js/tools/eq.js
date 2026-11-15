/** EQ Trainer: identifica qué frecuencia se ha realzado o recortado en una base. */

import { pick } from '../core/music.js';
import { PROGRESSION_PRESETS, resolveProgression } from '../core/progressions.js';
import { BackingPlayer } from '../audio/backing.js';
import { button, clear, h, segmented, select } from '../ui/dom.js';
import { header, playToggle } from './common.js';

const BANDS = [
  { freq: 100, label: '100 Hz', hint: 'Cuerpo / bombo' },
  { freq: 250, label: '250 Hz', hint: 'Barro' },
  { freq: 500, label: '500 Hz', hint: 'Caja / cuerpo' },
  { freq: 1000, label: '1 kHz', hint: 'Presencia media' },
  { freq: 2000, label: '2 kHz', hint: 'Mordiente' },
  { freq: 4000, label: '4 kHz', hint: 'Ataque / dureza' },
  { freq: 8000, label: '8 kHz', hint: 'Brillo / aire' },
];

/** Pistas CC0 (HoliznaCC0, Free Music Archive). Ver lab/assets/eq/CREDITOS.md. */
export const EQ_TRACKS = [
  { id: 'synth', label: 'Base sintética (guitarra, bajo, batería)' },
  { id: 'rock-classic', label: 'Rock clásico', file: 'rock-classic.mp3' },
  { id: 'rock-punk', label: 'Punk / rock duro', file: 'rock-punk.mp3' },
  { id: 'pop-funky', label: 'Pop', file: 'pop-funky.mp3' },
  { id: 'club-mutant', label: 'Electrónica / club', file: 'club-mutant.mp3' },
  { id: 'modern-pantheon', label: 'Música moderna (phonk)', file: 'modern-pantheon.mp3' },
  { id: 'funk-makefunk', label: 'Funk con bajo', file: 'funk-makefunk.mp3' },
];
const bufferCache = new Map();

const LEVELS = {
  easy: { label: 'Fácil', gain: 12, q: 0.9, bands: [100, 500, 2000, 8000] },
  medium: { label: 'Medio', gain: 8, q: 1.1, bands: BANDS.map((b) => b.freq) },
  hard: { label: 'Difícil', gain: 5, q: 1.4, bands: BANDS.map((b) => b.freq) },
};

function mount(root, ctx) {
  const { engine } = ctx;
  const cfg = { level: 'easy', track: ctx.storage.get('eq-track', 'synth') };
  let trackSrc = null;
  const q = { band: null, sign: 1, answered: false, eq: true };
  const score = { right: 0, total: 0 };
  const stage = h('section', { class: 'panel stack' });

  const player = new BackingPlayer(engine, 'eq');
  const settings = {
    root: 'A', mode: 'minor', signature: '4/4', groove: 'rock', bpm: 100, countIn: false,
    drumsOn: true, bassOn: true, guitarOn: true, synthOn: true, clickOn: false,
    resolved: resolveProgression('A', PROGRESSION_PRESETS.minor[0].chords),
    guitarTone: 'bright',
  };
  player.transport.onStop = () => {
    play.set(false);
    engine.setEq({ gain: 0 });
  };
  async function loadTrack(def) {
    if (!bufferCache.has(def.id)) {
      const res = await fetch(new URL(`../../assets/eq/${def.file}`, import.meta.url));
      if (!res.ok) throw new Error(`No se pudo cargar ${def.file}`);
      bufferCache.set(def.id, await engine.ctx.decodeAudioData(await res.arrayBuffer()));
    }
    return bufferCache.get(def.id);
  }
  function stopTrack() {
    if (trackSrc) { try { trackSrc.stop(); } catch { /* ya parada */ } trackSrc.disconnect(); trackSrc = null; }
  }
  function stopAll() {
    player.stop();
    stopTrack();
    play.set(false);
    engine.setEq({ gain: 0 });
  }
  ctx.onCleanup(() => {
    stopTrack();
    player.stop();
    engine.setEq({ gain: 0 });
  });
  const play = playToggle({ startLabel: '▶ Reproducir la base', onStart: () => startLoop(), onStop: () => stopAll(), size: 'btn-lg' });

  function apply() {
    const lvl = LEVELS[cfg.level];
    if (!q.band) return engine.setEq({ gain: 0 });
    engine.setEq({ freq: q.band, gain: q.eq ? lvl.gain * q.sign : 0, q: lvl.q });
  }

  function newQuestion() {
    const lvl = LEVELS[cfg.level];
    q.band = pick(lvl.bands);
    q.sign = Math.random() < 0.5 ? 1 : -1;
    q.answered = false;
    q.eq = true;
    apply();
    draw();
  }

  async function startLoop() {
    await engine.ensure();
    if (!q.band) newQuestion();
    apply();
    const def = EQ_TRACKS.find((t) => t.id === cfg.track);
    if (!def?.file) return player.start(settings);
    try {
      const buffer = await loadTrack(def);
      stopTrack();
      trackSrc = engine.ctx.createBufferSource();
      trackSrc.buffer = buffer;
      trackSrc.loop = true;
      trackSrc.connect(engine.master);
      trackSrc.start(0, Math.random() * Math.max(0, buffer.duration - 20));
    } catch (err) {
      play.set(false);
      ctx.toast(err.message);
    }
  }

  function answer(freq, btn) {
    if (q.answered) return;
    q.answered = true;
    score.total += 1;
    const ok = freq === q.band;
    if (ok) score.right += 1;
    ctx.logSeconds(15);
    draw(freq);
    void btn;
  }

  function draw(picked = null) {
    clear(stage);
    const lvl = LEVELS[cfg.level];
    stage.append(
      h('div', { class: 'row row--between' }, h('div', { class: 'pills' }, h('span', { class: 'pill' }, `${score.right}/${score.total}`)), segmented(Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })), cfg.level, (v) => { cfg.level = v; q.band = null; draw(); })),
      h('div', { class: 'field' }, h('label', {}, 'Pista'), select(EQ_TRACKS.map((t) => ({ value: t.id, label: t.label })), cfg.track, (v) => { const was = trackSrc || player.transport?.running; stopAll(); cfg.track = v; ctx.storage.set('eq-track', v); if (was) { play.set(true); startLoop(); } })),
      h('p', { class: 'hint' }, `Hay un EQ activo en la base (${lvl.gain} dB). Alterna «Original» y «Con EQ» y decide qué banda de frecuencias está alterada.`),
      h('div', { class: 'row', style: 'justify-content:center' }, play.el, button('Original', { variant: q.eq ? 'outline' : 'dark', onClick: () => { q.eq = false; apply(); draw(picked); } }), button('Con EQ', { variant: q.eq ? 'dark' : 'outline', onClick: () => { q.eq = true; apply(); draw(picked); } })),
    );
    const opts = h('div', { class: 'options' });
    BANDS.filter((b) => lvl.bands.includes(b.freq)).forEach((b) => {
      const btn = h('button', { type: 'button', class: 'option-btn', title: b.hint }, h('div', {}, b.label), h('div', { class: 'hint' }, b.hint));
      if (q.answered) {
        btn.disabled = true;
        if (b.freq === q.band) btn.classList.add('is-right');
        else if (b.freq === picked) btn.classList.add('is-wrong');
      } else btn.addEventListener('click', () => answer(b.freq, btn));
      opts.append(btn);
    });
    stage.append(opts);
    if (q.answered) {
      const info = BANDS.find((b) => b.freq === q.band);
      stage.append(
        h('div', { class: `feedback ${picked === q.band ? 'ok' : 'bad'}` }, `${picked === q.band ? '✓ ' : '✗ '}Era ${info.label} (${q.sign > 0 ? 'realce' : 'recorte'} de ${lvl.gain} dB) · ${info.hint}.`),
        button('Siguiente', { variant: 'accent', onClick: newQuestion }),
      );
    } else if (!q.band) {
      stage.append(button('Nueva pregunta', { variant: 'accent', onClick: newQuestion }));
    }
  }

  root.append(
    header('Oído y afinación', 'EQ Trainer', 'Educa tu oído para la mezcla y para tu propio sonido: reconoce qué banda de frecuencias se ha realzado o recortado en una base de guitarra, bajo y batería.'),
    stage,
    h('section', { class: 'panel' }, h('h2', {}, 'Cómo practicar'), h('p', { class: 'hint' }, 'Empieza en «Fácil» con realces de 12 dB. Escucha «Original» y «Con EQ» varias veces, piensa si el cambio suena grave, medio o agudo y acota. Con auriculares es más fácil.')),
  );
  draw();
}

export default {
  id: 'eq',
  title: 'EQ Trainer',
  group: 'ears',
  icon: '≈',
  summary: 'Identifica qué banda de frecuencias se ha realzado o recortado en una base.',
  isNew: true,
  mount,
};
