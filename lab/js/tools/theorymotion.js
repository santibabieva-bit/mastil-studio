/**
 * Teoría en movimiento: la armonía, las tensiones, los intervalos y los modos
 * animados sobre el mástil, con sonido. Lo que en un libro es una tabla, aquí
 * se ve cambiar.
 */

import {
  INTERVAL_NAMES, ROOT_CHOICES, TUNINGS, mod, parseRoot, pcName, prettyNote,
} from '../core/music.js';
import { CHORD_TYPES, chordSymbol } from '../core/chords.js';
import {
  JAM_PRESETS, chordTones, jamPreset, scaleLabel, scalePcs, suggestScales,
} from '../core/jam.js';
import {
  BRIGHTNESS, MODE_LABEL, degreeName, intervalMap, modeBoard, modeMorph, tensionMap,
} from '../core/motion.js';
import { COLORS, createAnimBoard } from '../ui/animboard.js';
import {
  button, clear, h, segmented, select, slider, toggle,
} from '../ui/dom.js';
import { header } from './common.js';

const TABS = [
  { value: 'harmony', label: '🎨 Armonía en vivo' },
  { value: 'tension', label: '🌡 Mapa de tensión' },
  { value: 'interval', label: '↗ Intervalos' },
  { value: 'modes', label: '🌗 Modos' },
];
const ROLE_COLOR = { root: COLORS.root, third: COLORS.third, fifth: COLORS.fifth, seventh: COLORS.seventh };
const KIND_COLOR = { chord: '#2f8a57', tension: '#d9a21c', avoid: '#c2412f' };
const PC_NAMES = (pc) => prettyNote(pcName(pc, 'sharp'));
const SCALE_CHOICES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'naturalMinor', 'locrian', 'harmonicMinor', 'melodicMinor', 'pentatonicMajor', 'pentatonicMinor', 'blues'];

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    tab: ctx.params.tab ?? ctx.storage.get('tm-tab', 'harmony'),
    root: ctx.storage.get('tm-root', 'A'),
    prog: ctx.storage.get('tm-prog', 'twofiveone'),
    bpm: ctx.storage.get('tm-bpm', 80),
    context: false,
    chordType: ctx.storage.get('tm-chord', 'maj7'),
    scale: null,
    interval: ctx.storage.get('tm-interval', 4),
    mode: 'major',
  };
  const body = h('div', { class: 'stack' });
  let stopAll = () => {};
  ctx.onCleanup(() => stopAll());
  const rootPc = () => parseRoot(cfg.root)?.pc ?? 9;

  const rootSelect = (onChange) => h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; ctx.storage.set('tm-root', v); onChange(); }));

  /** Todas las posiciones de un conjunto de pcs con un dato por pc. */
  function positions(pcMap, maxFret = 12) {
    const out = [];
    for (let s = 0; s < 6; s += 1) {
      for (let f = 0; f <= maxFret; f += 1) {
        const pc = mod(tuning[s] + f, 12);
        if (pcMap.has(pc)) out.push({ s, f, pc, ...pcMap.get(pc) });
      }
    }
    return out;
  }

  /* ───────────── 1. Armonía en vivo ───────────── */
  function harmony() {
    const board = createAnimBoard({ tuning, from: 0, to: 12, title: 'Armonía en vivo' });
    const chordEl = h('div', { class: 'anim-chord' }, '–');
    const caption = h('p', { class: 'anim-caption' }, 'Pulsa ▶: cada acorde se pinta con sus notas. Fíjate en las notas que se quedan y cambian de papel.');
    const followEl = h('p', { class: 'hint' }, 'Pulsa una nota del mástil para seguirla: te digo qué papel cumple en cada acorde.');
    let follow = null;
    let timer = 0;
    let idx = 0;
    let next = 0;
    let playing = false;
    const chords = () => jamPreset(cfg.prog).chords.map((c) => ({ rootPc: mod(rootPc() + c.s, 12), typeId: c.t }));
    const name = (c) => chordSymbol(PC_NAMES(c.rootPc), c.typeId);

    function paint(i) {
      const list = chords();
      const c = list[i % list.length];
      const prev = list[(i - 1 + list.length) % list.length];
      const tones = chordTones(c.rootPc, c.typeId);
      const map = new Map(tones.map((t) => [t.pc, t]));
      const dots = positions(map).map((p) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: p.label, fill: ROLE_COLOR[p.role] ?? COLORS.note, alpha: follow != null && p.pc !== follow ? 0.45 : 1 }));
      if (cfg.context) {
        const scale = suggestScales({ key: { rootPc: rootPc(), mode: jamPreset(cfg.prog).mode }, chord: c })[0];
        const ctxPcs = new Map(scalePcs(scale.rootPc, scale.quality).filter((pc) => !map.has(pc)).map((pc) => [pc, {}]));
        dots.push(...positions(ctxPcs).map((p) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: '', fill: '#cfc6b2', alpha: 0.5, scale: 0.55 })));
      }
      board.dots(dots);
      chordEl.textContent = name(c);
      const prevTones = new Map(chordTones(prev.rootPc, prev.typeId).map((t) => [t.pc, t]));
      const common = tones.filter((t) => prevTones.has(t.pc));
      if (i > 0) {
        for (const p of positions(new Map(common.map((t) => [t.pc, t])))) board.pulse(p.s, p.f, COLORS.accent);
        caption.textContent = common.length
          ? `De ${name(prev)} a ${name(c)}: ${common.map((t) => `${PC_NAMES(t.pc)} pasa de ${prevTones.get(t.pc).label} a ${t.label}`).join(' · ')}.`
          : `De ${name(prev)} a ${name(c)}: ninguna nota en común; todo se mueve.`;
      }
      if (follow != null) describeFollow();
    }

    function describeFollow() {
      const list = chords();
      const parts = list.map((c) => {
        const iv = mod(follow - c.rootPc, 12);
        const t = chordTones(c.rootPc, c.typeId).find((x) => x.pc === follow);
        return `${name(c)}: ${t ? `<b>${t.label}</b>` : ({ 2: '9', 5: '11', 9: '13', 1: '♭9', 6: '♯11', 8: '♭13' }[iv] ?? '·')}`;
      });
      followEl.innerHTML = `Siguiendo <b>${PC_NAMES(follow)}</b> → ${parts.join(' · ')}`;
    }

    function schedule() {
      const list = chords();
      const spb = 60 / cfg.bpm;
      while (next < engine.time + 0.2) {
        const i = idx;
        const c = list[i % list.length];
        const t = next;
        const midis = CHORD_TYPES[c.typeId].intervals.map((iv) => 52 + mod(c.rootPc - 4, 12) + iv);
        engine.pad(midis, t, spb * 4, 0.45);
        engine.bass(36 + mod(c.rootPc, 12), t, spb * 1.8, 0.7);
        for (let b = 0; b < 4; b += 1) engine.click(t + b * spb, { accent: b === 0, sound: 'click', vol: 0.3 });
        engine.at(t, () => paint(i));
        next += spb * 4;
        idx += 1;
      }
    }
    async function play() {
      if (playing) { stop(); return; }
      await engine.ensure();
      playing = true;
      idx = 0;
      next = engine.time + 0.1;
      playBtn.textContent = '■ Parar';
      engine.notePlaying('theory', true);
      schedule();
      timer = setInterval(schedule, 40);
    }
    function stop() { playing = false; clearInterval(timer); playBtn.textContent = '▶ Tocar la progresión'; engine.notePlaying('theory', false); }
    stopAll = stop;
    const playBtn = button('▶ Tocar la progresión', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: play });
    board.el.classList.add('is-clickable');
    board.onClick((hit) => { follow = mod(tuning[hit.s] + hit.f, 12); paint(Math.max(0, idx - 1)); });
    paint(0);
    return [
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Progresión'), select(JAM_PRESETS.map((p) => ({ value: p.id, label: p.label })), cfg.prog, (v) => { cfg.prog = v; ctx.storage.set('tm-prog', v); idx = 0; paint(0); })),
        rootSelect(() => paint(Math.max(0, idx - 1))),
      ),
      h('div', { class: 'row' },
        slider({ min: 40, max: 160, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; ctx.storage.set('tm-bpm', v); } }),
        toggle('Escala de fondo', cfg.context, (v) => { cfg.context = v; paint(Math.max(0, idx - 1)); }),
      ),
      chordEl, board.el, caption, followEl,
      h('div', { class: 'row', style: 'justify-content:center' }, playBtn, button('Dejar de seguir', { variant: 'ghost', onClick: () => { follow = null; followEl.textContent = 'Pulsa una nota del mástil para seguirla.'; paint(Math.max(0, idx - 1)); } })),
      legend([['Tónica', COLORS.root], ['3.ª', COLORS.third], ['5.ª', COLORS.fifth], ['7.ª / 6.ª', COLORS.seventh], ['Nota común (destello)', COLORS.accent]]),
    ];
  }

  /* ───────────── 2. Mapa de tensión ───────────── */
  function tension() {
    const board = createAnimBoard({ tuning, from: 0, to: 12, title: 'Mapa de tensión' });
    const chordEl = h('div', { class: 'anim-chord' }, '');
    const why = h('p', { class: 'anim-caption' }, 'Pulsa una nota para oírla sobre el acorde.');
    let drone = 0;
    const chord = () => ({ rootPc: rootPc(), typeId: cfg.chordType });
    function scaleQ() {
      if (cfg.scale) return cfg.scale;
      const sug = suggestScales({ key: { rootPc: rootPc(), mode: ['m', 'm7', 'm6', 'm7b5'].includes(cfg.chordType) ? 'minor' : 'major' }, chord: chord() })[0];
      return sug?.quality ?? 'major';
    }
    function paint() {
      const c = chord();
      const pcs = scalePcs(c.rootPc, scaleQ());
      const map = new Map(tensionMap(c, pcs).map((t) => [t.pc, t]));
      board.dots(positions(map).map((p) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: p.label, fill: KIND_COLOR[p.kind], scale: p.kind === 'chord' ? 1 : 0.9 })));
      chordEl.textContent = `${chordSymbol(prettyNote(cfg.root), cfg.chordType)} · ${scaleLabel(scaleQ())}`;
    }
    async function playChord(t = null) {
      await engine.ensure();
      const c = chord();
      const midis = CHORD_TYPES[c.typeId].intervals.map((iv) => 48 + c.rootPc + iv);
      engine.pad(midis, t ?? engine.time + 0.02, 2.2, 0.5);
      engine.bass(36 + c.rootPc, t ?? engine.time + 0.02, 1.5, 0.6);
    }
    function toggleDrone() {
      if (drone) { clearInterval(drone); drone = 0; droneBtn.textContent = '▶ Acorde de fondo'; return; }
      playChord();
      drone = setInterval(() => playChord(), 2000);
      droneBtn.textContent = '■ Quitar el acorde';
    }
    stopAll = () => { clearInterval(drone); drone = 0; };
    const droneBtn = button('▶ Acorde de fondo', { variant: 'accent', onClick: toggleDrone });
    board.el.classList.add('is-clickable');
    board.onClick(async (hit) => {
      const pc = mod(tuning[hit.s] + hit.f, 12);
      const t = tensionMap(chord(), scalePcs(rootPc(), scaleQ())).find((x) => x.pc === pc);
      await engine.ensure();
      if (!drone) playChord();
      engine.pluck(tuning[hit.s] + hit.f, engine.time + 0.05, { dur: 1.8, vel: 0.9 });
      board.pulse(hit.s, hit.f, t ? KIND_COLOR[t.kind] : COLORS.ghost);
      why.textContent = t ? `${PC_NAMES(pc)} = ${t.label}. ${t.why}` : `${PC_NAMES(pc)} no está en la escala: es una nota de paso cromática.`;
    });
    paint();
    drawScaleSel();
    const typeIds = ['maj', 'm', '7', 'maj7', 'm7', 'm7b5', '6', 'm6', 'sus4'];
    return [
      h('div', { class: 'grid-2' },
        rootSelect(paint),
        h('div', { class: 'field' }, h('label', {}, 'Acorde'), select(typeIds.map((id) => ({ value: id, label: CHORD_TYPES[id].name })), cfg.chordType, (v) => { cfg.chordType = v; cfg.scale = null; ctx.storage.set('tm-chord', v); paint(); drawScaleSel(); })),
      ),
      scaleSelBox,
      chordEl, board.el, why,
      h('div', { class: 'row', style: 'justify-content:center' }, droneBtn),
      legend([['Nota del acorde: reposo', KIND_COLOR.chord], ['Tensión disponible', KIND_COLOR.tension], ['Nota a evitar (de paso)', KIND_COLOR.avoid]]),
    ];
    function drawScaleSel() {
      clear(scaleSelBox);
      scaleSelBox.append(h('div', { class: 'field' }, h('label', {}, 'Escala'), select(SCALE_CHOICES.map((q) => ({ value: q, label: scaleLabel(q) })), scaleQ(), (v) => { cfg.scale = v; paint(); })));
    }
  }
  const scaleSelBox = h('div');

  /* ───────────── 3. Intervalos como formas ───────────── */
  function interval() {
    const board = createAnimBoard({ tuning, from: 0, to: 12, title: 'Intervalos como formas' });
    const caption = h('p', { class: 'anim-caption' }, '');
    const shapes = h('div', { class: 'stack' });
    let timers = [];
    stopAll = () => { timers.forEach(clearTimeout); timers = []; };
    function paint(animate = true) {
      stopAll();
      board.clearArrows();
      const pairs = intervalMap(rootPc(), cfg.interval, { tuning, maxFret: 12 });
      const roots = new Map();
      const targets = new Map();
      for (const p of pairs) { roots.set(`${p.from.s}-${p.from.f}`, p.from); targets.set(`${p.to.s}-${p.to.f}`, p.to); }
      const info = INTERVAL_NAMES[cfg.interval];
      board.dots([
        ...[...targets.values()].map((t) => ({ key: `${t.s}-${t.f}`, s: t.s, f: t.f, label: info.short, fill: COLORS.seventh })),
        ...[...roots.values()].map((r) => ({ key: `${r.s}-${r.f}`, s: r.s, f: r.f, label: PC_NAMES(rootPc()), fill: COLORS.root })),
      ]);
      pairs.forEach((p, k) => {
        const draw = () => board.arrow(p.from, p.to, { color: p.crossesB ? COLORS.tension : COLORS.accent, bend: p.same ? 0.35 : 0.15, label: p.crossesB ? '+1 por la Si' : null });
        if (animate) timers.push(setTimeout(draw, 140 * k)); else draw();
      });
      caption.textContent = `${info.name} desde ${PC_NAMES(rootPc())}: ${pairs.length} formas en los trastes 0–12. Las flechas moradas cruzan a la cuerda Si: ahí la forma se corre un traste.`;
      // Resumen de las formas: misma cuerda, cuerda siguiente y la siguiente.
      clear(shapes);
      const sameStr = cfg.interval;
      const nextStr = cfg.interval - 5;
      const nextB = nextStr + 1;
      const two = cfg.interval - 10;
      shapes.append(h('ul', { class: 'hint', style: 'margin:0' },
        h('li', {}, `Misma cuerda: ${sameStr} trastes hacia el puente.`),
        h('li', {}, `Cuerda siguiente (más aguda): ${describe(nextStr)}; si cruzas de Sol a Si, ${describe(nextB)}.`),
        two >= -5 ? h('li', {}, `Dos cuerdas más arriba: ${describe(two)} (con la Si en medio, ${describe(two + 1)}).`) : null,
      ));
    }
    const describe = (df) => (df === 0 ? 'mismo traste' : df > 0 ? `${df} traste${df > 1 ? 's' : ''} hacia el puente` : `${-df} traste${df < -1 ? 's' : ''} hacia la cejuela`);
    async function hear() {
      await engine.ensure();
      const base = 52 + mod(rootPc() - 4, 12);
      engine.pluck(base, engine.time + 0.05, { dur: 1 });
      engine.pluck(base + cfg.interval, engine.time + 0.6, { dur: 1 });
      engine.pluck(base, engine.time + 1.3, { dur: 1.4 });
      engine.pluck(base + cfg.interval, engine.time + 1.3, { dur: 1.4 });
    }
    paint();
    return [
      h('div', { class: 'grid-2' },
        rootSelect(() => paint()),
        h('div', { class: 'field' }, h('label', {}, 'Intervalo'), select(INTERVAL_NAMES.slice(1).map((i) => ({ value: i.semis, label: `${i.short} · ${i.name}` })), cfg.interval, (v) => { cfg.interval = Number(v); ctx.storage.set('tm-interval', cfg.interval); paint(); })),
      ),
      board.el, caption, shapes,
      h('div', { class: 'row', style: 'justify-content:center' }, button('▶ Dibujar otra vez', { variant: 'accent', onClick: () => paint() }), button('🔊 Oír el intervalo', { variant: 'outline', onClick: hear })),
    ];
  }

  /* ───────────── 4. Modos que se transforman ───────────── */
  function modes() {
    const board = createAnimBoard({ tuning, from: 0, to: 12, title: 'Modos' });
    const title = h('div', { class: 'anim-chord' }, '');
    const caption = h('p', { class: 'anim-caption' }, 'Elige un modo: solo se mueven las notas que cambian.');
    let auto = 0;
    let last = 'major';
    stopAll = () => { clearInterval(auto); auto = 0; };
    function paint(q, sound = true) {
      const changes = modeMorph(last, q);
      const changed = new Set(changes.map((c) => c.degree));
      board.dots(modeBoard(rootPc(), q, { tuning, maxFret: 12 }).map((n) => ({
        key: n.key, s: n.s, f: n.f, label: n.name, fill: n.degree === 0 ? COLORS.root : changed.has(n.degree) ? COLORS.accent : '#2b2a26',
        scale: changed.has(n.degree) ? 1.1 : 1,
      })));
      title.textContent = `${prettyNote(cfg.root)} ${MODE_LABEL[q]}`;
      caption.textContent = q === last
        ? `Fórmula: ${scalePcs(0, q).map((iv, i) => degreeName(i, iv)).join(' ')}`
        : changes.length ? `De ${MODE_LABEL[last]} a ${MODE_LABEL[q]}: ${changes.map((c) => `${c.delta < 0 ? 'baja' : 'sube'} la ${c.name.replace(/[♭♯]/, '')} → ${c.name}`).join(', ')}.` : 'Mismas notas.';
      last = q;
      cfg.mode = q;
      if (sound) playScale(q);
      drawModeBtns();
    }
    async function playScale(q) {
      await engine.ensure();
      const base = 48 + mod(rootPc(), 12);
      const ivs = scalePcs(0, q);
      [...ivs, 12].forEach((iv, k) => engine.pluck(base + iv, engine.time + 0.05 + k * 0.18, { dur: 0.5, vel: 0.7 }));
    }
    const btns = h('div', { class: 'row', style: 'justify-content:center' });
    function drawModeBtns() {
      clear(btns);
      for (const q of BRIGHTNESS) btns.append(button(MODE_LABEL[q], { variant: q === cfg.mode ? 'dark' : 'outline', onClick: () => { stopAll(); paint(q); } }));
    }
    function tour() {
      if (auto) { stopAll(); tourBtn.textContent = '▶ Del más brillante al más oscuro'; return; }
      let k = 0;
      last = BRIGHTNESS[0];
      paint(BRIGHTNESS[0]);
      auto = setInterval(() => { k += 1; if (k >= BRIGHTNESS.length) { stopAll(); tourBtn.textContent = '▶ Del más brillante al más oscuro'; return; } paint(BRIGHTNESS[k]); }, 2600);
      tourBtn.textContent = '■ Parar';
    }
    const tourBtn = button('▶ Del más brillante al más oscuro', { variant: 'accent', onClick: tour });
    paint('major', false);
    return [
      rootSelect(() => paint(cfg.mode, false)),
      title, board.el, caption, btns,
      h('div', { class: 'row', style: 'justify-content:center' }, tourBtn),
      h('p', { class: 'hint' }, 'Cada paso hacia la derecha baja una sola nota un semitono. Por eso el lidio suena tan brillante (♯4) y el locrio tan inestable (♭2 y ♭5).'),
    ];
  }

  function legend(items) {
    return h('div', { class: 'anim-legend' }, ...items.map(([label, color]) => h('span', {}, h('i', { style: `background:${color}` }), label)));
  }

  function render() {
    stopAll();
    stopAll = () => {};
    clear(body);
    const parts = { harmony, tension, interval, modes }[cfg.tab]();
    body.append(h('section', { class: 'panel stack' }, ...parts));
  }

  root.append(
    header('Aprender el mástil', 'Teoría en movimiento', 'La teoría animada sobre el mástil y con sonido: cómo cambian de papel las notas al cambiar de acorde, qué notas reposan y cuáles tensan, la forma de cada intervalo y qué nota define cada modo.'),
    h('section', { class: 'panel' }, segmented(TABS, cfg.tab, (v) => { cfg.tab = v; ctx.storage.set('tm-tab', v); render(); })),
    body,
  );
  render();
}

export default {
  id: 'theorymotion',
  title: 'Teoría en movimiento',
  group: 'neck',
  icon: '🌀',
  summary: 'Armonía en vivo, mapa de tensión, intervalos como formas y modos que se transforman, animados y con sonido.',
  isNew: true,
  mount,
};
