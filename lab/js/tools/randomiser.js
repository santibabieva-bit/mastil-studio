/** Randomiser: notas, ritmos, progresiones, riffs, ideas para improvisar y retos de práctica. */

import {
  COMMON_KEYS, TUNINGS, mod, pick, prettyNote,
} from '../core/music.js';
import { chordSymbol } from '../core/chords.js';
import { generateRhythm, GROOVES, rhythmEvents, countLabels } from '../core/rhythm.js';
import { PROGRESSION_PRESETS, randomProgression, resolveProgression } from '../core/progressions.js';
import { CHALLENGES, TECH_OPTIONS, generateRiff, randomChallenge } from '../core/riff.js';
import { tabToJson } from '../core/tab.js';
import { tabToAlphaTex } from '../core/alphatex.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import { guitarMidis } from '../audio/backing.js';
import { button, clear, h, segmented, select, slider, toggle } from '../ui/dom.js';
import { header, qualityChoices, rootChoices, safeCollection } from './common.js';

const MODES = [
  { value: 'notes', label: 'Notas' },
  { value: 'rhythm', label: 'Ritmos' },
  { value: 'chords', label: 'Acordes' },
  { value: 'riff', label: 'Riffs' },
  { value: 'jam', label: 'Jam' },
  { value: 'challenge', label: 'Retos' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const sess = ctx.session.get();
  const st = {
    mode: ctx.params.m ?? 'notes',
    root: sess.root,
    quality: sess.family === 'scale' ? sess.quality : 'pentatonicMinor',
    count: 6,
    strings: [true, true, true, true, true, true],
    level: 'medium',
    complexity: 2,
    outside: false,
    techniques: ['legato'],
    category: '',
    last: null,
  };
  const body = h('div', { class: 'stack' });
  let riffScore = null;
  ctx.onCleanup(() => riffScore?.destroy());
  const std = TUNINGS.standard.midi;

  const common = () => h('section', { class: 'panel stack' }, h('h2', {}, 'Tonalidad'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('label', {}, 'Tónica'), select(rootChoices(), st.root, (v) => { st.root = v; })),
      h('div', { class: 'field' }, h('label', {}, 'Escala'), select(qualityChoices('scale'), st.quality, (v) => { st.quality = v; })),
    ),
  );

  const result = h('section', { class: 'panel stack', 'aria-live': 'polite' });

  /* ─── Notas ─── */
  function genNotes() {
    const col = safeCollection(st.root, 'scale', st.quality);
    const strings = st.strings.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    if (!strings.length) return { items: [] };
    const items = [];
    for (let i = 0; i < st.count; i += 1) {
      const note = pick(col.notes);
      const s = pick(strings);
      let f = mod(note.pc - std[s], 12);
      if (f < 2 && Math.random() < 0.5) f += 12;
      items.push({ note, s, f, midi: std[s] + f });
    }
    return { items };
  }
  function drawNotes() {
    const { items } = st.last;
    clear(result);
    result.append(
      h('h2', {}, 'Tus notas'),
      h('div', { class: 'row' }, ...items.map((it) => h('div', { class: 'stat', style: 'text-align:center;min-width:92px' }, h('strong', {}, it.note.name), h('span', {}, `cuerda ${it.s + 1} · tr. ${it.f}`)))),
      button('▶ Oírlas', { variant: 'outline', onClick: async () => { await engine.ensure(); const t = engine.time + 0.05; items.forEach((it, i) => engine.pluck(it.midi, t + i * 0.6, { dur: 0.9 })); } }),
      h('p', { class: 'hint' }, 'Reto: toca cada nota, luego dale una frase a cada una; después inventa un motivo que las una en este orden.'),
    );
  }

  /* ─── Ritmos ─── */
  function drawRhythm() {
    const r = st.last;
    const { events, total } = rhythmEvents(r);
    const labels = countLabels('4/4');
    clear(result);
    const rows = r.bars.map((bar) => h('div', { class: 'mono', style: 'font-size:1.05rem;letter-spacing:.06em' }, bar.steps.map((on, i) => (on ? (labels[i % labels.length] || '·').padEnd(2) : '· ')).join('').replace(/(.{8})/g, '$1 ')));
    result.append(
      h('h2', {}, 'Tu ritmo'), ...rows,
      h('p', { class: 'hint' }, `${events.length} golpes en ${total / 16} compás(es). Los números/letras marcan dónde tocas; los puntos son silencios.`),
      h('div', { class: 'row' },
        button('▶ Oírlo con click', { variant: 'outline', onClick: async () => {
          await engine.ensure();
          const step = 60 / 90 / 4;
          const t = engine.time + 0.1;
          for (let s = 0; s < total; s += 4) engine.click(t + s * step, { accent: s % 16 === 0, sound: 'wood', vol: 0.7 });
          events.forEach((e) => engine.drum('snare', t + e.start * step, 0.6));
        } }),
        button('Practicarlo en el Rhythm Trainer', { variant: 'ghost', onClick: () => ctx.go('rhythm', { lvl: st.level === 'medium' ? 'medium' : st.level, bars: r.bars.length }) }),
      ),
    );
  }

  /* ─── Acordes ─── */
  function drawChords() {
    const { prog, mode } = st.last;
    const resolved = resolveProgression(st.root, prog);
    clear(result);
    result.append(
      h('h2', {}, 'Tu progresión'),
      h('div', { class: 'row' }, ...resolved.map((c) => h('span', { class: 'pill', style: 'font-size:1.3rem;padding:8px 16px' }, prettyNote(chordSymbol(c.rootName, c.typeId))))),
      h('div', { class: 'row' },
        button('▶ Oírla', { variant: 'outline', onClick: async () => { await engine.ensure(); const t = engine.time + 0.05; resolved.forEach((c, i) => engine.strum(guitarMidis(c.rootPc, c.typeId), t + i * 1.2, { vel: 0.75, dur: 1.3 })); } }),
        button('Abrirla en Backing Track', { variant: 'accent', onClick: () => ctx.go('backing', { root: st.root, mode, chords: encodeURIComponent(JSON.stringify(prog)) }) }),
      ),
    );
  }

  /* ─── Riffs ─── */
  function drawRiff() {
    const tab = st.last;
    clear(result);
    riffScore?.destroy();
    const stage = h('div');
    riffScore = createScore(stage, { stave: 'scoretab', onPlaying: (on) => engine.notePlaying('randomiser', on) });
    result.append(
      h('h2', {}, 'Tu riff'),
      scoreToolbar(riffScore, { playback: true, stave: true }),
      stage,
      h('div', { class: 'row' }, button('Editar en Tab Creator', { variant: 'accent', onClick: () => { ctx.storage.set('tab-handoff', tabToJson(tab)); ctx.go('tab', { handoff: 1 }); } })),
      h('p', { class: 'hint' }, 'Ligados (arco), slides, bends y vibrato se muestran sobre la tablatura. Pulsa «Reproducir» para oírlo con el cursor.'),
    );
    riffScore.load(tabToAlphaTex(tab));
  }

  /* ─── Jam ─── */
  function genJam() {
    const mode = Math.random() < 0.55 ? 'minor' : 'major';
    const preset = pick(PROGRESSION_PRESETS[mode]);
    const grooveId = pick(Object.keys(GROOVES));
    return { root: pick(COMMON_KEYS), mode, preset, groove: grooveId, bpm: 60 + Math.round(Math.random() * 16) * 5 };
  }
  function drawJam() {
    const j = st.last;
    const scale = j.mode === 'minor' ? ['pentatonicMinor', 'Pentatónica menor'] : ['pentatonicMajor', 'Pentatónica mayor'];
    clear(result);
    result.append(
      h('h2', {}, 'Tu jam'),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('strong', {}, `${prettyNote(j.root)} ${j.mode === 'minor' ? 'menor' : 'mayor'}`), h('span', {}, 'tonalidad')),
        h('div', { class: 'stat' }, h('strong', {}, `${j.bpm}`), h('span', {}, 'bpm')),
        h('div', { class: 'stat' }, h('strong', {}, GROOVES[j.groove].label), h('span', {}, 'groove')),
      ),
      h('p', {}, `Progresión: ${j.preset.label}. Improvisa con la ${scale[1].toLowerCase()} de ${prettyNote(j.root)}.`),
      h('div', { class: 'row' },
        button('Abrir la base', { variant: 'accent', onClick: () => ctx.go('backing', { root: j.root, mode: j.mode, prog: j.preset.id, groove: j.groove, bpm: j.bpm }) }),
        button('Ver la escala en el mástil', { variant: 'outline', onClick: () => ctx.go('navigator', { root: j.root, fam: 'scale', q: scale[0] }) }),
      ),
    );
  }

  /* ─── Retos ─── */
  function drawChallenge() {
    const c = st.last;
    clear(result);
    result.append(h('div', { class: 'kicker' }, c.cat), h('p', { class: 'quiz-prompt' }, c.text), h('p', { class: 'hint' }, 'Dedícale 5 minutos y apunta cómo ha ido en tu Practice Log.'));
  }

  function generate() {
    if (st.mode === 'notes') { st.last = genNotes(); drawNotes(); }
    else if (st.mode === 'rhythm') { st.last = generateRhythm({ signature: '4/4', bars: 2, level: st.level, rests: true }); drawRhythm(); }
    else if (st.mode === 'chords') { st.last = { prog: randomProgression({ mode: st.quality.toLowerCase().includes('minor') || st.quality === 'naturalMinor' ? 'minor' : 'major', complexity: st.complexity, length: 4, outside: st.outside }), mode: st.quality.toLowerCase().includes('minor') ? 'minor' : 'major' }; drawChords(); }
    else if (st.mode === 'riff') { st.last = generateRiff({ tuning: std, collection: safeCollection(st.root, 'scale', st.quality), length: 16, techniques: st.techniques }); drawRiff(); }
    else if (st.mode === 'jam') { st.last = genJam(); drawJam(); }
    else { st.last = randomChallenge(Math.random, st.category || null); drawChallenge(); }
  }

  function drawOptions() {
    clear(body);
    const opts = h('section', { class: 'panel stack' }, h('h2', {}, 'Opciones'));
    if (st.mode === 'notes') {
      opts.append(
        slider({ min: 2, max: 12, value: st.count, label: 'Cuántas', onInput: (v) => { st.count = v; } }),
        h('div', { class: 'row' }, ...st.strings.map((on, i) => toggle(`${i + 1}ª`, on, (v) => { st.strings[i] = v; }))),
      );
    } else if (st.mode === 'rhythm') {
      opts.append(h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Dificultad'), segmented([{ value: 'easy', label: 'Fácil' }, { value: 'medium', label: 'Medio' }, { value: 'hard', label: 'Difícil' }], st.level, (v) => { st.level = v; })));
    } else if (st.mode === 'chords') {
      opts.append(
        slider({ min: 1, max: 5, value: st.complexity, label: 'Complejidad', format: (v) => ['Básica', 'Con relativos', 'Con séptimas', 'Con extensiones', 'Jazz'][v - 1], onInput: (v) => { st.complexity = v; } }),
        toggle('Permitir acordes fuera de la tonalidad', st.outside, (v) => { st.outside = v; }),
      );
    } else if (st.mode === 'riff') {
      opts.append(h('div', { class: 'row' }, ...Object.entries(TECH_OPTIONS).map(([k, label]) => toggle(label, st.techniques.includes(k), (v) => { st.techniques = v ? [...st.techniques, k] : st.techniques.filter((x) => x !== k); }))));
    } else if (st.mode === 'challenge') {
      opts.append(h('div', { class: 'field' }, h('label', {}, 'Categoría'), select([{ value: '', label: 'Todas' }, ...[...new Set(CHALLENGES.map((c) => c.cat))].map((c) => ({ value: c, label: c }))], st.category, (v) => { st.category = v; })));
    } else {
      opts.append(h('p', { class: 'hint' }, 'Genera una tonalidad, progresión, groove y tempo al azar para improvisar sin pensar.'));
    }
    body.append(h('div', { class: 'tool-grid tool-grid--rev' },
      h('div', { class: 'stack' }, h('div', { class: 'row' }, button('🎲 Generar', { variant: 'accent', attrs: { class: 'btn btn-accent btn-lg' }, onClick: generate }), button('Otra vez', { variant: 'outline', onClick: generate })), result),
      h('div', { class: 'stack' }, st.mode === 'jam' || st.mode === 'challenge' || st.mode === 'rhythm' ? null : common(), opts),
    ));
    clear(result);
    result.append(h('p', { class: 'hint' }, 'Pulsa «Generar» para empezar.'));
    st.last = null;
  }

  const modeSeg = segmented(MODES, st.mode, (v) => { riffScore?.destroy(); riffScore = null; st.mode = v; ctx.setParams({ m: v }); drawOptions(); });
  root.append(header('Tocar y escribir', 'Randomiser', 'Rompe el bloqueo: genera notas, ritmos, progresiones, riffs, ideas de jam y retos de práctica. Todo se puede abrir en el resto de herramientas.'), modeSeg, body);
  drawOptions();
}

export default {
  id: 'randomiser',
  title: 'Randomiser',
  group: 'play',
  icon: '🎲',
  summary: 'Notas, ritmos, acordes, riffs con tab, ideas de jam y retos aleatorios.',
  isNew: true,
  mount,
};
