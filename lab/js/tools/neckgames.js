/**
 * Juegos del mástil: lluvia de notas, caza de notas y laberinto de escala.
 * Cada respuesta se apunta en el Mapa del mástil.
 */

import {
  ROOT_CHOICES, TUNINGS, mod, parseRoot, pcName, prettyNote,
} from '../core/music.js';
import { scaleLabel, scalePcs } from '../core/jam.js';
import {
  checkScalePath, isScaleStep, positionsOf, rainSpeed, scaleNodes, shortestScalePath, toSteps,
} from '../core/motion.js';
import { COLORS, createAnimBoard, createPlayer, noteName } from '../ui/animboard.js';
import {
  button, clear, h, segmented, select, toggle,
} from '../ui/dom.js';
import { header } from './common.js';
import { logSpot } from './neckmap.js';

const GAMES = [
  { value: 'rain', label: '🌧 Lluvia de notas' },
  { value: 'hunt', label: '🔎 Caza de notas' },
  { value: 'maze', label: '🧭 Laberinto de escala' },
];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const name = (pc) => prettyNote(pcName(pc, 'sharp'));

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    game: ctx.params.game ?? ctx.storage.get('games-game', 'rain'),
    naturals: ctx.storage.get('games-naturals', true),
    maxFret: 12,
    root: ctx.storage.get('games-root', 'A'),
    scale: ctx.storage.get('games-scale', 'pentatonicMinor'),
    showScale: true,
  };
  const body = h('div', { class: 'stack' });
  let cleanup = () => {};
  ctx.onCleanup(() => cleanup());
  const pluck = async (s, f) => { await engine.ensure(); engine.pluck(tuning[s] + f, engine.time + 0.01, { dur: 0.8 }); };
  const randPc = () => {
    const pool = cfg.naturals ? NATURALS : [...Array(12).keys()];
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const best = (k) => ctx.storage.get(`games-best-${k}`, 0);
  const saveBest = (k, v) => { if (v > best(k)) { ctx.storage.set(`games-best-${k}`, v); return true; } return false; };

  /* ───────────── Lluvia ───────────── */
  function rain() {
    const board = createAnimBoard({ tuning, from: 0, to: cfg.maxFret, title: 'Lluvia de notas' });
    board.el.classList.add('is-clickable');
    const lane = h('div', { class: 'rain-lane' });
    const stats = h('div', { class: 'row row--between' });
    const fb = h('p', { class: 'anim-caption' }, 'Las notas caen: encuéntralas en el mástil antes de que toquen el suelo.');
    const st = { running: false, score: 0, lives: 3, level: 0, drop: null, pc: null, born: 0, streak: 0 };
    function drawStats() {
      clear(stats);
      stats.append(h('strong', {}, `Puntos: ${st.score}`), h('span', {}, `Nivel ${st.level + 1}`), h('span', {}, '❤'.repeat(st.lives) + '♡'.repeat(Math.max(0, 3 - st.lives))), h('span', { class: 'hint' }, `Récord: ${best('rain')}`));
    }
    function spawn() {
      if (!st.running) return;
      lane.querySelector('.rain-drop')?.remove();
      st.pc = randPc();
      const d = h('div', { class: 'rain-drop', style: `left:${10 + Math.random() * 75}%;animation-duration:${rainSpeed(st.level)}s` }, name(st.pc));
      d.addEventListener('animationend', () => {
        if (!st.running || st.drop !== d) return;
        st.lives -= 1;
        st.streak = 0;
        fb.textContent = `💧 Se te escapó ${name(st.pc)}. Estaba, por ejemplo, en ${positionsOf(st.pc, { maxFret: cfg.maxFret }).slice(0, 3).map((p) => `cuerda ${p.s + 1} traste ${p.f}`).join(', ')}.`;
        showWhere(st.pc);
        drawStats();
        if (st.lives <= 0) end(); else setTimeout(spawn, 900);
      });
      st.drop = d;
      st.born = performance.now();
      lane.append(d);
    }
    function showWhere(pc) {
      const list = positionsOf(pc, { maxFret: cfg.maxFret });
      board.dots(list.map((p) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: name(pc), fill: COLORS.ghost, text: '#2b2a26', alpha: 0.9 })));
      setTimeout(() => board.dots([]), 1200);
    }
    board.onClick((hit) => {
      if (!st.running || st.pc == null) return;
      pluck(hit.s, hit.f);
      const pc = mod(tuning[hit.s] + hit.f, 12);
      const ms = performance.now() - st.born;
      if (pc === st.pc) {
        logSpot(ctx, hit.s, hit.f, true, ms);
        st.score += 1 + Math.floor(st.level / 2);
        st.streak += 1;
        if (st.streak % 5 === 0) st.level += 1;
        board.pulse(hit.s, hit.f, COLORS.ok);
        st.drop.classList.add('is-hit');
        st.drop = null;
        fb.textContent = `✓ ${name(pc)} en ${(ms / 1000).toFixed(1)} s${st.streak % 5 === 0 ? ' · ¡sube la velocidad!' : ''}`;
        drawStats();
        setTimeout(spawn, 350);
      } else {
        logSpot(ctx, hit.s, hit.f, false, null);
        board.pulse(hit.s, hit.f, COLORS.bad);
        fb.textContent = `✗ Eso es ${name(pc)}.`;
      }
    });
    function start() {
      Object.assign(st, { running: true, score: 0, lives: 3, level: 0, streak: 0 });
      startBtn.hidden = true;
      drawStats();
      spawn();
    }
    function end() {
      st.running = false;
      lane.querySelector('.rain-drop')?.remove();
      const record = saveBest('rain', st.score);
      fb.textContent = `Fin de la partida: ${st.score} puntos${record ? ' · 🏆 ¡récord!' : ''}. Los fallos ya están en tu Mapa del mástil.`;
      startBtn.hidden = false;
      startBtn.textContent = 'Otra partida';
      ctx.logSeconds(60);
    }
    cleanup = () => { st.running = false; };
    const startBtn = button('Empezar', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: start });
    drawStats();
    return [stats, lane, board.el, fb, h('div', { class: 'row', style: 'justify-content:center' }, startBtn)];
  }

  /* ───────────── Caza ───────────── */
  function hunt() {
    const board = createAnimBoard({ tuning, from: 0, to: cfg.maxFret, title: 'Caza de notas' });
    board.el.classList.add('is-clickable');
    const target = h('div', { class: 'anim-chord' }, '');
    const fb = h('p', { class: 'anim-caption' }, 'Encuentra TODAS las posiciones de la nota antes de que acabe el tiempo.');
    const timerEl = h('div', { class: 'big-number', style: 'text-align:center' }, '20');
    const st = { running: false, pc: null, found: new Set(), wrong: 0, end: 0, timer: 0, all: [], started: 0 };
    function start() {
      st.pc = randPc();
      st.all = positionsOf(st.pc, { maxFret: cfg.maxFret });
      st.found = new Set();
      st.wrong = 0;
      st.running = true;
      st.started = performance.now();
      st.end = performance.now() + 20000 + st.all.length * 600;
      board.dots([]);
      board.clearArrows();
      target.textContent = `Todas las ${name(st.pc)}`;
      fb.textContent = `Hay ${st.all.length} entre los trastes 0 y ${cfg.maxFret}.`;
      startBtn.hidden = true;
      clearInterval(st.timer);
      st.timer = setInterval(() => {
        const left = Math.max(0, st.end - performance.now());
        timerEl.textContent = (left / 1000).toFixed(0);
        if (left <= 0) finish();
      }, 200);
    }
    function finish() {
      clearInterval(st.timer);
      st.running = false;
      const missing = st.all.filter((p) => !st.found.has(`${p.s}-${p.f}`));
      // Las que faltaron aparecen una a una y se dibujan las octavas.
      missing.forEach((p, k) => setTimeout(() => {
        board.dots([...st.all.filter((q) => st.found.has(`${q.s}-${q.f}`) || missing.indexOf(q) <= k).map((q) => ({ key: `${q.s}-${q.f}`, s: q.s, f: q.f, label: name(st.pc), fill: st.found.has(`${q.s}-${q.f}`) ? COLORS.ok : COLORS.bad }))]);
        board.pulse(p.s, p.f, COLORS.bad);
        logSpot(ctx, p.s, p.f, false, null);
      }, 250 * k));
      setTimeout(() => {
        const sorted = [...st.all].sort((a, b) => (tuning[a.s] + a.f) - (tuning[b.s] + b.f));
        for (let i = 1; i < sorted.length; i += 1) {
          const a = sorted[i - 1];
          const b = sorted[i];
          if (tuning[b.s] + b.f - (tuning[a.s] + a.f) === 12) board.arrow(a, b, { color: COLORS.seventh, bend: 0.2, label: '8.ª' });
        }
      }, 250 * missing.length + 200);
      const score = st.found.size - st.wrong;
      const record = saveBest('hunt', score);
      fb.textContent = `${st.found.size}/${st.all.length} encontradas, ${st.wrong} fallos${record ? ' · 🏆 récord' : ''}. Las flechas azules unen cada nota con su octava: el patrón que se repite por todo el mástil.`;
      startBtn.hidden = false;
      startBtn.textContent = 'Otra nota';
      ctx.logSeconds(Math.round((performance.now() - st.started) / 1000));
    }
    board.onClick((hit) => {
      if (!st.running) return;
      pluck(hit.s, hit.f);
      const k = `${hit.s}-${hit.f}`;
      const pc = mod(tuning[hit.s] + hit.f, 12);
      if (pc === st.pc && !st.found.has(k)) {
        st.found.add(k);
        logSpot(ctx, hit.s, hit.f, true, performance.now() - st.started);
        board.dots(st.all.filter((p) => st.found.has(`${p.s}-${p.f}`)).map((p) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: name(st.pc), fill: COLORS.ok })));
        board.pulse(hit.s, hit.f, COLORS.ok);
        if (st.found.size === st.all.length) finish();
      } else if (pc !== st.pc) {
        st.wrong += 1;
        logSpot(ctx, hit.s, hit.f, false, null);
        board.pulse(hit.s, hit.f, COLORS.bad);
      }
    });
    cleanup = () => clearInterval(st.timer);
    const startBtn = button('Empezar', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: start });
    return [h('div', { class: 'row row--between' }, target, timerEl), board.el, fb, h('div', { class: 'row', style: 'justify-content:center' }, startBtn, h('span', { class: 'hint' }, `Récord: ${best('hunt')}`))];
  }

  /* ───────────── Laberinto ───────────── */
  function maze() {
    const board = createAnimBoard({ tuning, from: 0, to: cfg.maxFret, title: 'Laberinto de escala' });
    board.el.classList.add('is-clickable');
    const fb = h('p', { class: 'anim-caption' }, '');
    const player = createPlayer(board, engine);
    const st = { start: null, end: null, path: [], pcs: [], done: false };
    const rootPc = () => parseRoot(cfg.root)?.pc ?? 9;
    function draw() {
      const nodes = cfg.showScale ? scaleNodes(st.pcs, { tuning, maxFret: cfg.maxFret }) : [];
      const pathKeys = new Set(st.path.map((p) => `${p.s}-${p.f}`));
      board.dots([
        ...nodes.filter((n) => !pathKeys.has(`${n.s}-${n.f}`)).map((n) => ({ key: `${n.s}-${n.f}`, s: n.s, f: n.f, label: '', fill: mod(n.midi - rootPc(), 12) === 0 ? '#e7b3ad' : COLORS.ghost, alpha: 0.6, scale: 0.55 })),
        ...st.path.map((p, i) => ({ key: `${p.s}-${p.f}`, s: p.s, f: p.f, label: i === 0 ? 'A' : String(i), fill: i === 0 ? COLORS.ok : COLORS.accent })),
        { key: `${st.end.s}-${st.end.f}`, s: st.end.s, f: st.end.f, label: '🏁', fill: '#fffdf8', stroke: COLORS.bad, strokeWidth: 3, text: COLORS.bad },
      ]);
      board.clearArrows();
      for (let i = 1; i < st.path.length; i += 1) board.arrow(st.path[i - 1], st.path[i], { color: COLORS.accent, bend: 0.15 });
    }
    function newMaze() {
      st.pcs = scalePcs(rootPc(), cfg.scale);
      const nodes = scaleNodes(st.pcs, { tuning, maxFret: cfg.maxFret });
      for (let k = 0; k < 100; k += 1) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        const best = shortestScalePath(a, b, st.pcs, { tuning, maxFret: cfg.maxFret });
        if (best && best.length >= 5 && best.length <= 10 && Math.abs(a.f - b.f) >= 4) { st.start = a; st.end = b; st.best = best; break; }
      }
      st.path = [st.start];
      st.done = false;
      fb.textContent = `Ve de A a 🏁 tocando solo notas de ${prettyNote(cfg.root)} ${scaleLabel(cfg.scale).toLowerCase()}, de grado en grado (a lo sumo una cuerda y 4 trastes por paso). Mejor ruta: ${st.best.length} notas.`;
      draw();
    }
    board.onClick((hit) => {
      if (st.done) return;
      const node = { s: hit.s, f: hit.f, midi: tuning[hit.s] + hit.f };
      const last = st.path[st.path.length - 1];
      pluck(hit.s, hit.f);
      if (!st.pcs.includes(mod(node.midi, 12))) { board.pulse(hit.s, hit.f, COLORS.bad); fb.textContent = `✗ ${noteName(node.midi)} no está en la escala.`; logSpot(ctx, hit.s, hit.f, false, null); return; }
      if (!isScaleStep(last, node, st.pcs)) { board.pulse(hit.s, hit.f, COLORS.bad); fb.textContent = `✗ Desde ${noteName(last.midi)} el grado vecino es otro (o queda demasiado lejos).`; return; }
      st.path.push(node);
      logSpot(ctx, hit.s, hit.f, true, null);
      draw();
      if (node.s === st.end.s && node.f === st.end.f) {
        const r = checkScalePath(st.path, st.start, st.end, st.pcs, { tuning, maxFret: cfg.maxFret });
        st.done = true;
        fb.textContent = `🎉 ${r.why} Mira la ruta más corta…`;
        if (r.perfect) saveBest('maze', best('maze') + 1);
        setTimeout(() => {
          player.load(toSteps(r.best.map((n) => ({ s: n.s, f: n.f })), tuning, 0.5), { next: false, trail: 12, arrows: true, hand: true, colorOf: () => COLORS.seventh });
          player.play({ tempo: 90 });
        }, 900);
      }
    });
    cleanup = () => player.stop();
    newMaze();
    return [
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; ctx.storage.set('games-root', v); newMaze(); })),
        h('div', { class: 'field' }, h('label', {}, 'Escala'), select(['pentatonicMinor', 'pentatonicMajor', 'major', 'naturalMinor', 'dorian', 'mixolydian', 'blues'].map((q) => ({ value: q, label: scaleLabel(q) })), cfg.scale, (v) => { cfg.scale = v; ctx.storage.set('games-scale', v); newMaze(); })),
      ),
      toggle('Ver la escala (desactívalo para el reto de verdad)', cfg.showScale, (v) => { cfg.showScale = v; draw(); }),
      board.el, fb,
      h('div', { class: 'row', style: 'justify-content:center' },
        button('↶ Deshacer paso', { variant: 'ghost', onClick: () => { if (st.path.length > 1 && !st.done) { st.path.pop(); draw(); } } }),
        button('Nuevo laberinto', { variant: 'accent', onClick: newMaze }),
        button('Ver la solución', { variant: 'outline', onClick: () => { st.done = true; player.load(toSteps(st.best.map((n) => ({ s: n.s, f: n.f })), tuning, 0.5), { trail: 12, arrows: true, hand: true, colorOf: () => COLORS.seventh }); player.play({ tempo: 90 }); } }),
      ),
    ];
  }

  function render() {
    cleanup();
    cleanup = () => {};
    clear(body);
    const parts = { rain, hunt, maze }[cfg.game]();
    body.append(h('section', { class: 'panel stack' },
      cfg.game !== 'maze' ? toggle('Solo notas naturales (sin ♯/♭)', cfg.naturals, (v) => { cfg.naturals = v; ctx.storage.set('games-naturals', v); }) : null,
      ...parts));
  }

  root.append(
    header('Aprender el mástil', 'Juegos del mástil', 'Retos cortos con tiempo para que encontrar notas sea automático: la lluvia acelera con cada acierto, la caza te obliga a ver todas las octavas y el laberinto a moverte por la escala sin perderte. Todo cuenta para tu Mapa del mástil.'),
    h('section', { class: 'panel' }, segmented(GAMES, cfg.game, (v) => { cfg.game = v; ctx.storage.set('games-game', v); render(); })),
    body,
  );
  render();
}

export default {
  id: 'neckgames',
  title: 'Juegos del mástil',
  group: 'neck',
  icon: '🎮',
  summary: 'Lluvia de notas, caza de notas y laberinto de escala; cada respuesta cuenta para tu mapa del mástil.',
  isNew: true,
  mount,
};
