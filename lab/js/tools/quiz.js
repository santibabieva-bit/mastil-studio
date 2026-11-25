/** Theory Trainer: quizzes de notas, intervalos, acordes, romanos, modos y armaduras. */

import {
  LEVELS, QUIZ_TOPICS, checkAnswer, describeStatKey, emptyStats, makeQuestion, recordAnswer, weakSpots,
} from '../core/quiz.js';
import { getTuning, midiName, prettyNote } from '../core/music.js';
import { hitFromEvent } from '../ui/fretboard.js';
import { createLiveBoard } from '../ui/liveboard.js';
import { button, clear, h, segmented } from '../ui/dom.js';
import { dueCount } from '../core/srs.js';
import { header } from './common.js';
import { logSpot } from './neckmap.js';

const MODES = [
  { value: 'timed', label: '2 minutos' },
  { value: 'ten', label: '10 preguntas' },
  { value: 'free', label: 'Sin límite' },
];

function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = getTuning('standard').midi;
  let stats = ctx.storage.get('quiz-stats', null) ?? emptyStats();
  const cfg = {
    level: ctx.storage.get('quiz-level', 'intermediate'),
    topics: QUIZ_TOPICS[ctx.params.topic] ? new Set([ctx.params.topic]) : new Set(ctx.storage.get('quiz-topics', Object.keys(QUIZ_TOPICS))),
    mode: 'timed',
    focusWeak: false,
  };
  const run = { question: null, answered: 0, right: 0, streak: 0, best: 0, started: 0, deadline: 0, timer: 0, locked: false, lastTick: 0 };

  const stage = h('div', { class: 'panel' });
  const sidePanel = h('div', { class: 'stack' });
  ctx.onCleanup(() => clearInterval(run.timer));

  const save = () => {
    ctx.storage.set('quiz-stats', stats);
    ctx.storage.set('quiz-level', cfg.level);
    ctx.storage.set('quiz-topics', [...cfg.topics]);
  };

  /* ─── Pantalla inicial ─── */
  function renderSetup(summary = null) {
    clearInterval(run.timer);
    clear(stage);
    const topicBtns = h('div', { class: 'row' });
    for (const topic of Object.values(QUIZ_TOPICS)) {
      const btn = h('button', { type: 'button', class: `btn btn-sm ${cfg.topics.has(topic.id) ? 'btn-dark' : 'btn-outline'}`, 'aria-pressed': String(cfg.topics.has(topic.id)) }, topic.label);
      btn.addEventListener('click', () => {
        if (cfg.topics.has(topic.id) && cfg.topics.size > 1) cfg.topics.delete(topic.id);
        else cfg.topics.add(topic.id);
        renderSetup(summary);
      });
      topicBtns.append(btn);
    }
    stage.append(
      summary,
      h('h2', {}, 'Configura tu sesión'),
      h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Nivel'), segmented(Object.values(LEVELS).map((l) => ({ value: l.id, label: l.label })), cfg.level, (v) => { cfg.level = v; save(); })),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Temas'), topicBtns),
        h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Modo'), segmented(MODES, cfg.mode, (v) => { cfg.mode = v; })),
        h('label', { class: 'switch-row' },
          h('input', { type: 'checkbox', checked: cfg.focusWeak, onchange: (e) => { cfg.focusWeak = e.target.checked; } }),
          h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span')),
          h('span', {}, 'Insistir en mis puntos débiles'),
        ),
        h('div', { class: 'row' }, button('Empezar', { variant: 'accent', attrs: {}, onClick: start }), button('Borrar mis estadísticas', { variant: 'ghost', onClick: () => { stats = emptyStats(); save(); renderSide(); toast('Estadísticas borradas'); } })),
      ),
    );
  }

  function toast(msg) {
    ctx.toast(msg);
  }

  function start() {
    run.answered = 0;
    run.right = 0;
    run.streak = 0;
    run.best = 0;
    run.started = performance.now();
    run.deadline = cfg.mode === 'timed' ? run.started + 120000 : 0;
    run.lastTick = run.started;
    save();
    nextQuestion();
    clearInterval(run.timer);
    if (cfg.mode === 'timed') {
      run.timer = setInterval(() => {
        const left = Math.max(0, run.deadline - performance.now());
        const el = stage.querySelector('[data-timer]');
        if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
        if (left <= 0) finish();
      }, 250);
    }
  }

  function finish() {
    clearInterval(run.timer);
    const seconds = (performance.now() - run.started) / 1000;
    ctx.logSeconds(Math.min(seconds, 20 * 60));
    save();
    const rate = run.answered ? Math.round((run.right / run.answered) * 100) : 0;
    const summary = h('div', { class: 'panel', style: 'background:#fffdf8;margin-bottom:14px' },
      h('div', { class: 'kicker' }, 'Resultado'),
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('strong', {}, `${run.right}/${run.answered}`), h('span', {}, 'aciertos')),
        h('div', { class: 'stat' }, h('strong', {}, `${rate}%`), h('span', {}, 'precisión')),
        h('div', { class: 'stat' }, h('strong', {}, `${run.best}`), h('span', {}, 'mejor racha')),
      ),
    );
    renderSetup(summary);
    renderSide();
  }

  function nextQuestion() {
    if (cfg.mode === 'ten' && run.answered >= 10) return finish();
    const weak = cfg.focusWeak ? stats.byKey : null;
    run.question = makeQuestion({ topics: [...cfg.topics], level: cfg.level, weak, srs: cfg.focusWeak ? (stats.srs ?? {}) : null });
    run.locked = false;
    renderQuestion();
  }

  /* ─── Pregunta ─── */
  /** Pinta el mástil animado de la pregunta (la respuesta aparece con transición). */
  function paint(wrap, opts) {
    (wrap.__live ?? createLiveBoard(wrap, { morph: false })).render(opts);
  }

  function boardFor(question, reveal = null, picked = null) {
    const maxFret = Math.max(5, LEVELS[cfg.level].maxFret);
    const notes = [];
    if (question.type === 'fretNote') {
      const { s, f } = question.board;
      notes.push(reveal
        ? { s, f, kind: 'select', label: reveal }
        : { s, f, kind: 'hidden', label: '?' });
    } else if (question.type === 'findNote') {
      if (reveal) notes.push({ s: question.answer.s, f: question.answer.f, kind: 'select', label: reveal });
      if (picked && (picked.s !== question.answer.s || picked.f !== question.answer.f)) notes.push({ s: picked.s, f: picked.f, kind: 'hidden', label: '✕' });
    }
    return { tuning, from: 0, to: question.type === 'findNote' ? 11 : maxFret, notes, title: question.prompt };
  }

  function renderQuestion() {
    const q = run.question;
    clear(stage);
    const progress = cfg.mode === 'ten' ? Math.min(100, (run.answered / 10) * 100) : 0;
    stage.append(
      h('div', { class: 'row row--between' },
        h('div', { class: 'pills' },
          h('span', { class: 'pill' }, QUIZ_TOPICS[q.type].label),
          h('span', { class: 'pill' }, `${run.right}/${run.answered}`),
          run.streak >= 3 ? h('span', { class: 'pill pill--ok' }, `🔥 ${run.streak}`) : null,
        ),
        h('div', { class: 'row' },
          cfg.mode === 'timed' ? h('strong', { class: 'mono', dataset: { timer: '1' } }, '2:00') : null,
          button('Terminar', { variant: 'ghost', onClick: finish }),
        ),
      ),
      cfg.mode === 'ten' ? h('div', { class: 'progress', style: 'margin:10px 0' }, h('i', { style: `width:${progress}%` })) : h('div', { style: 'height:12px' }),
      h('div', { class: 'quiz-prompt' }, q.prompt),
    );
    if (q.board || q.kind === 'fret') {
      const wrap = h('div', { class: 'fb-wrap is-quiz' });
      paint(wrap, boardFor(q));
      if (q.kind === 'fret') {
        wrap.addEventListener('click', (e) => {
          if (run.locked) return;
          const hit = hitFromEvent(e);
          if (!hit) return;
          answer(hit, wrap);
        });
      }
      stage.append(wrap);
    }
    if (q.kind === 'choice') {
      const opts = h('div', { class: 'options', style: 'margin-top:12px' });
      q.options.forEach((o, i) => {
        const btn = h('button', { type: 'button', class: 'option-btn', dataset: { value: o.value } }, `${o.label}`);
        btn.addEventListener('click', () => answer(o.value, null, btn));
        btn.title = `Tecla ${i + 1}`;
        opts.append(btn);
      });
      stage.append(opts);
    } else {
      stage.append(h('p', { class: 'hint', style: 'margin-top:10px' }, 'Pulsa el traste correcto en el mástil.'));
    }
    stage.append(h('div', { id: 'quiz-fb' }));
  }

  async function answer(given, wrap, btn) {
    if (run.locked) return;
    run.locked = true;
    const q = run.question;
    const ok = checkAnswer(q, given);
    run.answered += 1;
    run.streak = ok ? run.streak + 1 : 0;
    run.best = Math.max(run.best, run.streak);
    if (ok) run.right += 1;
    stats = recordAnswer(stats, q, ok);
    save();
    const now = performance.now();
    const spot = q.type === 'fretNote' ? q.board : q.type === 'findNote' ? q.answer : null;
    if (spot) logSpot(ctx, spot.s, spot.f, ok, now - run.lastTick);
    ctx.logSeconds(Math.min(25, (now - run.lastTick) / 1000));
    run.lastTick = now;

    if (q.kind === 'choice') {
      stage.querySelectorAll('.option-btn').forEach((b) => {
        b.disabled = true;
        if (String(b.dataset.value) === String(q.answer)) b.classList.add('is-right');
      });
      if (!ok && btn) btn.classList.add('is-wrong');
      if (q.type === 'fretNote') {
        const label = prettyNote(midiName(tuning[q.board.s] + q.board.f)).replace(/\d+$/, '');
        paint(stage.querySelector('.fb-wrap'), boardFor(q, label));
      }
    } else if (wrap) {
      const midi = tuning[q.answer.s] + q.answer.f;
      paint(wrap, boardFor(q, prettyNote(midiName(midi)).replace(/\d+$/, ''), given));
    }
    if (ok) {
      try {
        await engine.ensure();
        const midi = q.kind === 'fret' ? tuning[q.answer.s] + q.answer.f : q.board ? tuning[q.board.s] + q.board.f : null;
        if (midi != null) engine.pluck(midi, engine.time + 0.01, { vel: 0.7 });
      } catch {
        /* el audio es opcional aquí */
      }
    }
    const fb = stage.querySelector('#quiz-fb');
    fb.append(
      h('div', { class: `feedback ${ok ? 'ok' : 'bad'}` }, `${ok ? '✓ Correcto. ' : '✗ Casi. '}${q.explanation}`),
      h('div', { class: 'row', style: 'margin-top:10px' }, button('Siguiente (Enter)', { variant: 'accent', onClick: nextQuestion })),
    );
    renderSide();
  }

  const onKey = (e) => {
    if (!run.question || e.target.closest?.('input,select,textarea')) return;
    if (e.key === 'Enter' && run.locked) {
      e.preventDefault();
      nextQuestion();
      return;
    }
    const n = Number(e.key);
    if (!run.locked && n >= 1 && n <= 9) {
      const btn = stage.querySelectorAll('.option-btn')[n - 1];
      if (btn) btn.click();
    }
  };
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey));

  /* ─── Panel lateral: estadísticas y puntos débiles ─── */
  function renderSide() {
    clear(sidePanel);
    const total = stats.total.right + stats.total.wrong;
    const rate = total ? Math.round((stats.total.right / total) * 100) : 0;
    const weak = weakSpots(stats, 6);
    sidePanel.append(
      h('section', { class: 'panel' },
        h('h2', {}, 'Tu historial'),
        h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('strong', {}, `${total}`), h('span', {}, 'respuestas')),
          h('div', { class: 'stat' }, h('strong', {}, `${rate}%`), h('span', {}, 'precisión')),
        ),
      ),
      h('section', { class: 'panel' },
        h('h2', {}, 'Repaso espaciado'),
        h('div', { class: 'stat' }, h('strong', {}, `${dueCount(stats.srs)}`), h('span', {}, 'tarjetas por repasar hoy')),
        h('p', { class: 'hint' }, 'Con «Insistir en mis puntos débiles» activado, lo que fallas vuelve pronto y lo que dominas se espacia (1, 2, 4, 8, 16 y 32 días).'),
      ),
      h('section', { class: 'panel' },
        h('h2', {}, 'Puntos débiles'),
        weak.length
          ? h('table', { class: 'table' }, h('tbody', {}, weak.map((w) => h('tr', {}, h('td', {}, describeStatKey(w.key)), h('td', {}, `${Math.round(w.rate * 100)}%`), h('td', { class: 'muted' }, `${w.attempts} int.`)))))
          : h('p', { class: 'hint' }, 'Aún no hay suficientes datos. Cuando falles algo varias veces aparecerá aquí.'),
      ),
    );
  }

  root.append(
    header('Aprender el mástil', 'Theory Trainer', 'Sesiones cortas para memorizar el mástil, los intervalos, los acordes de cada tonalidad, los números romanos y los modos. Guarda tus puntos débiles para insistir donde fallas.'),
    h('div', { class: 'tool-grid tool-grid--rev' }, stage, sidePanel),
  );
  renderSetup();
  renderSide();
}

export default {
  id: 'quiz',
  title: 'Theory Trainer',
  group: 'neck',
  icon: '✦',
  summary: 'Quizzes de notas del mástil, intervalos, acordes, romanos y modos con puntos débiles.',
  isNew: true,
  mount,
};
