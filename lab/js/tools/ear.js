/** Ear Trainer: intervalos y calidades de acorde con sonido de guitarra o piano. */

import { EAR_CHORD_SETS, EAR_INTERVAL_SETS, earQuestion, earScore } from '../core/ear.js';
import { button, clear, h, segmented, select, toggle } from '../ui/dom.js';
import { header } from './common.js';

function mount(root, ctx) {
  const { engine } = ctx;
  const cfg = {
    mode: ctx.storage.get('ear-mode', 'interval'),
    intervalSet: 'basic',
    chordSet: 'triads',
    direction: 'up',
    inversions: false,
    sound: 'guitar',
    focusMissed: true,
  };
  const history = [];
  const missed = new Map(); // answer → fallos
  let q = null;
  let answered = false;
  const stage = h('section', { class: 'panel stack' });
  const side = h('section', { class: 'panel stack' });

  async function playQuestion() {
    if (!q) return;
    await engine.ensure();
    const t0 = engine.time + 0.05;
    const note = (m, t, dur) => (cfg.sound === 'piano' ? engine.piano(m, t, dur, 0.8) : engine.pluck(m, t, { vel: 0.8, dur: dur + 0.3 }));
    if (q.mode === 'interval') {
      if (q.harmonic) q.midis.forEach((m) => note(m, t0, 1.4));
      else q.midis.forEach((m, i) => note(m, t0 + i * 0.85, 0.9));
    } else {
      // Acorde: rasgueado suave y luego en bloque.
      q.midis.forEach((m, i) => note(m, t0 + i * 0.03, 1.8));
    }
  }

  function next() {
    // Si «insistir en fallos» está activo y hay fallos pendientes, a veces repetimos la respuesta.
    q = earQuestion({
      mode: cfg.mode,
      set: cfg.mode === 'interval' ? cfg.intervalSet : cfg.chordSet,
      direction: cfg.direction,
      inversions: cfg.inversions,
    });
    if (cfg.focusMissed && missed.size && Math.random() < 0.35) {
      const wanted = [...missed.keys()][Math.floor(Math.random() * missed.size)];
      for (let i = 0; i < 12 && String(q.answer) !== String(wanted); i += 1) {
        q = earQuestion({ mode: cfg.mode, set: cfg.mode === 'interval' ? cfg.intervalSet : cfg.chordSet, direction: cfg.direction, inversions: cfg.inversions });
      }
    }
    answered = false;
    draw();
    playQuestion();
  }

  function draw() {
    clear(stage);
    const sc = earScore(history);
    stage.append(
      h('div', { class: 'row row--between' },
        h('div', { class: 'pills' }, h('span', { class: 'pill' }, `${sc.right}/${sc.total}`), sc.total ? h('span', { class: 'pill' }, `${Math.round(sc.rate * 100)}%`) : null),
        button('Reiniciar marcador', { variant: 'ghost', onClick: () => { history.length = 0; missed.clear(); draw(); } }),
      ),
    );
    if (!q) {
      stage.append(h('p', { class: 'quiz-prompt' }, cfg.mode === 'interval' ? 'Escucha dos notas y di qué intervalo forman.' : 'Escucha un acorde y di de qué tipo es.'), button('Empezar', { variant: 'accent', onClick: next }));
      return;
    }
    stage.append(
      h('p', { class: 'quiz-prompt' }, cfg.mode === 'interval' ? '¿Qué intervalo has oído?' : '¿Qué tipo de acorde es?'),
      h('div', { class: 'row' }, button('🔊 Repetir', { variant: 'outline', onClick: playQuestion })),
    );
    const opts = h('div', { class: 'options', style: 'margin-top:8px' });
    q.options.forEach((o) => {
      const btn = h('button', { type: 'button', class: 'option-btn', dataset: { value: o.value } }, o.label);
      btn.addEventListener('click', () => answer(o.value, btn));
      opts.append(btn);
    });
    stage.append(opts, h('div', { id: 'ear-fb' }));
  }

  function answer(value, btn) {
    if (answered) return;
    answered = true;
    const ok = String(value) === String(q.answer);
    history.push(ok);
    if (!ok) missed.set(q.answer, (missed.get(q.answer) ?? 0) + 1);
    else if (missed.has(q.answer)) missed.delete(q.answer);
    stage.querySelectorAll('.option-btn').forEach((b) => {
      b.disabled = true;
      if (String(b.dataset.value) === String(q.answer)) b.classList.add('is-right');
    });
    if (!ok) btn.classList.add('is-wrong');
    ctx.logSeconds(12);
    stage.querySelector('#ear-fb').append(
      h('div', { class: `feedback ${ok ? 'ok' : 'bad'}` }, `${ok ? '✓ Correcto: ' : '✗ Era: '}${q.label}`),
      h('div', { class: 'row', style: 'margin-top:10px' }, button('Siguiente', { variant: 'accent', onClick: next }), button('Oírlo otra vez', { variant: 'outline', onClick: playQuestion })),
    );
    drawSide();
  }

  function drawSide() {
    clear(side);
    side.append(
      h('h2', {}, 'Ajustes'),
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Ejercicio'), segmented([{ value: 'interval', label: 'Intervalos' }, { value: 'chord', label: 'Acordes' }], cfg.mode, (v) => { cfg.mode = v; ctx.storage.set('ear-mode', v); q = null; drawSide(); draw(); })),
    );
    if (cfg.mode === 'interval') {
      side.append(
        h('div', { class: 'field' }, h('label', {}, 'Conjunto'), select(Object.entries(EAR_INTERVAL_SETS).map(([value, s]) => ({ value, label: s.label })), cfg.intervalSet, (v) => { cfg.intervalSet = v; q = null; draw(); })),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Dirección'), segmented([{ value: 'up', label: '↑' }, { value: 'down', label: '↓' }, { value: 'both', label: '↑↓' }, { value: 'harmonic', label: 'A la vez' }], cfg.direction, (v) => { cfg.direction = v; q = null; draw(); })),
      );
    } else {
      side.append(
        h('div', { class: 'field' }, h('label', {}, 'Conjunto'), select(Object.entries(EAR_CHORD_SETS).map(([value, s]) => ({ value, label: s.label })), cfg.chordSet, (v) => { cfg.chordSet = v; q = null; draw(); })),
        toggle('Con inversiones', cfg.inversions, (v) => { cfg.inversions = v; }),
      );
    }
    side.append(
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Sonido'), segmented([{ value: 'guitar', label: 'Guitarra' }, { value: 'piano', label: 'Piano' }], cfg.sound, (v) => { cfg.sound = v; })),
      toggle('Insistir en lo que fallo', cfg.focusMissed, (v) => { cfg.focusMissed = v; }),
      h('p', { class: 'hint' }, missed.size ? `Pendientes de repasar: ${missed.size}` : 'Cuando falles una respuesta, volverá a aparecer más a menudo.'),
      h('p', { class: 'hint' }, 'Truco: asocia cada intervalo con el inicio de una canción que conozcas (la 5ª justa: «Estrellita»; la 4ª justa: «Aquí viene la novia»).'),
    );
  }

  root.append(
    header('Oído y afinación', 'Ear Trainer', 'Entrena tu oído con intervalos y calidades de acorde. Tu marcador y los fallos se usan para repetir lo que más te cuesta.'),
    h('div', { class: 'tool-grid tool-grid--rev' }, stage, side),
  );
  draw();
  drawSide();
}

export default {
  id: 'ear',
  title: 'Ear Trainer',
  group: 'ears',
  icon: '◖',
  summary: 'Intervalos y calidades de acorde con guitarra o piano, repasando lo que fallas.',
  mount,
};
