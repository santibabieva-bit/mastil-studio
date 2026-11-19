/**
 * Drills técnicos: biblioteca de ejercicios (púa, legato, manos, tapping…)
 * con escalera de velocidad (sube el tempo sólo con repeticiones limpias),
 * práctica en ráfagas y récords por ejercicio.
 */

import { ROOT_CHOICES, TUNINGS, parseRoot, prettyNote } from '../core/music.js';
import {
  DRILL_GROUPS, DRILL_LIST, buildDrill, drillById, eventMidi, permutations24,
} from '../core/drills.js';
import { dateKey } from '../core/practice.js';
import {
  FAIL_REASONS, bestSeries, burstPlan, diagnoseFailures, isPlateau, newLadder, recordClean, submitRep, topRecords,
} from '../core/speed.js';
import { Transport } from '../audio/transport.js';
import { beatsToAlphaTex, eventsToBeats, durationForSub } from '../core/alphatex.js';
import { createScore, scoreToolbar } from '../ui/score.js';
import {
  button, clear, h, segmented, select, slider,
} from '../ui/dom.js';
import { header, playToggle } from './common.js';


function mount(root, ctx) {
  const { engine } = ctx;
  const tuning = TUNINGS.standard.midi;
  const cfg = {
    drill: ctx.params.drill ?? ctx.storage.get('drill-id', 'alt-chromatic'),
    root: ctx.storage.get('drill-root', 'A'),
    startFret: ctx.storage.get('drill-fret', 5),
    variant: ctx.storage.get('drill-variant', 0),
    sub: ctx.storage.get('drill-sub', 2),
    mode: 'ladder',
    ladder: null,
    plan: null,
    planIdx: 0,
    planLoops: 0,
    bpm: 80,
  };
  let history = ctx.storage.get('speed-history', {});
  const transport = new Transport(engine, 'drills');
  let built = null;
  let loops = 0;
  ctx.onCleanup(() => transport.stop());

  const tabBox = h('div', { class: 'drill-score' });
  const score = createScore(tabBox, { stave: 'tab', fingers: true, cursor: false });
  ctx.onCleanup(() => score.destroy());
  const info = h('div', { class: 'stack' });
  const ladderBox = h('div', { class: 'stack' });
  const historyBox = h('div', { class: 'stack' });
  const msg = h('div', { class: 'feedback', hidden: true });
  const bpmOut = h('div', { class: 'big-number', style: 'text-align:center' }, '');
  const loopOut = h('div', { class: 'hint', style: 'text-align:center;min-height:1.2em' }, '');
  const play = playToggle({ startLabel: '▶ Empezar', stopLabel: '■ Parar', onStart: () => start(), onStop: () => transport.stop(), size: 'btn-lg' });
  transport.onStop = () => {
    play.set(false);
    score.seekBeat(0);
  };

  function rebuild() {
    const rootPc = parseRoot(cfg.root)?.pc ?? 9;
    built = buildDrill(cfg.drill, { tuning, root: rootPc, startFret: cfg.startFret, variant: cfg.variant, quality: 'm' });
    const [lo, hi] = built.drill.tempo;
    if (!cfg.ladder || cfg.ladder.drillId !== cfg.drill) {
      cfg.ladder = { ...newLadder({ start: lo, target: hi, step: 4, reps: 3 }), drillId: cfg.drill };
      cfg.bpm = cfg.ladder.bpm;
    }
    drawTab();
    drawInfo();
    drawLadder();
    drawHistory();
  }

  function drawTab() {
    const { duration, tuplet } = durationForSub(cfg.sub);
    score.load(beatsToAlphaTex(eventsToBeats(built.events), {
      title: built.drill.title,
      subtitle: 'Drill técnico',
      tempo: cfg.bpm,
      tuning,
      duration,
      tuplet,
      showFingers: true,
    }));
  }

  function drawInfo() {
    clear(info);
    const d = built.drill;
    const controls = [
      h('div', { class: 'field' }, h('label', {}, 'Tonalidad'), select(ROOT_CHOICES.map((r) => ({ value: r, label: prettyNote(r) })), cfg.root, (v) => { cfg.root = v; ctx.storage.set('drill-root', v); rebuild(); })),
      slider({ min: 1, max: 12, value: cfg.startFret, label: 'Traste inicial', format: (v) => `${v}`, onInput: (v) => { cfg.startFret = v; ctx.storage.set('drill-fret', v); rebuild(); } }),
    ];
    if (d.variants) {
      const perms = permutations24();
      controls.push(h('div', { class: 'field' }, h('label', {}, 'Permutación de dedos'), select(perms.map((p, i) => ({ value: i, label: `${i + 1}. ${p.join('-')}` })), cfg.variant, (v) => { cfg.variant = Number(v); ctx.storage.set('drill-variant', cfg.variant); rebuild(); })));
    }
    controls.push(h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Notas por pulso'), segmented([{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }], cfg.sub, (v) => { cfg.sub = Number(v); ctx.storage.set('drill-sub', cfg.sub); drawTab(); })));
    info.append(
      h('h2', { style: 'margin:0' }, d.title),
      h('p', {}, d.desc),
      h('p', { class: 'hint' }, `💡 ${d.tip}`),
      h('div', { class: 'grid-2' }, ...controls),
    );
  }

  /* ─── Escalera de velocidad ─── */
  function showMsg(text, kind = 'ok') {
    msg.hidden = !text;
    msg.className = `feedback ${kind}`;
    msg.textContent = text;
  }

  function rep(clean, reason = null) {
    const l = cfg.ladder;
    const bpmDone = l.bpm;
    cfg.askReason = false;
    const { ladder, event } = submitRep(l, clean, reason);
    cfg.ladder = { ...ladder, drillId: l.drillId };
    // Con un patrón de fallos repetidos, propone una acción concreta en lugar de seguir a ciegas.
    cfg.diag = clean ? null : diagnoseFailures(cfg.ladder);
    let recordMsg = null;
    if (clean) {
      const { history: next, isRecord } = recordClean(history, cfg.drill, bpmDone, dateKey());
      history = next;
      ctx.storage.set('speed-history', history);
      if (isRecord) recordMsg = `🏆 ¡Récord personal! ${bpmDone} bpm limpios.`;
    }
    const texts = {
      up: `Subes a ${ladder.bpm} bpm.`,
      hold: `Limpia ${ladder.streak}/${ladder.reps}. Una más del mismo tempo.`,
      retry: 'Sin prisa: otra vez al mismo tempo.',
      drop: `Estancado: bajas a ${ladder.bpm} bpm para reconstruir con limpieza.`,
      done: '🎯 ¡Objetivo alcanzado! Sube el objetivo o cambia de ejercicio.',
    };
    if (recordMsg) showMsg(`${recordMsg} ${event === 'up' ? texts.up : ''}`.trim(), 'ok');
    else showMsg(texts[event], event === 'drop' || event === 'retry' ? 'bad' : 'ok');
    cfg.bpm = cfg.ladder.bpm;
    drawLadder();
    drawHistory();
  }

  function drawLadder() {
    clear(ladderBox);
    const l = cfg.ladder;
    const dots = h('div', { class: 'ladder-dots', role: 'img', 'aria-label': `${l.streak} de ${l.reps} repeticiones limpias` },
      ...Array.from({ length: l.reps }, (_, i) => h('span', { class: `ladder-dot ${i < l.streak ? 'is-on' : ''}` })));
    bpmOut.textContent = `${cfg.bpm} bpm`;
    ladderBox.append(
      h('div', { class: 'segmented-wrap' }, segmented([{ value: 'ladder', label: 'Escalera' }, { value: 'burst', label: 'Ráfagas' }, { value: 'free', label: 'Libre' }], cfg.mode, (v) => { transport.stop(); cfg.mode = v; drawLadder(); })),
      bpmOut,
      loopOut,
    );
    if (cfg.mode === 'ladder') {
      ladderBox.append(
        dots,
        h('p', { class: 'hint', style: 'text-align:center' }, `Objetivo ${l.target} bpm · sube ${l.step} bpm tras ${l.reps} repeticiones limpias seguidas.`),
        h('div', { class: 'row', style: 'justify-content:center' },
          button('✓ Salió limpio', { variant: 'accent', onClick: () => rep(true) }),
          button('✗ Fallé', { variant: 'outline', onClick: () => { cfg.askReason = true; drawLadder(); } }),
        ),
        cfg.askReason ? h('div', { class: 'stack', style: 'align-items:center' },
          h('p', { class: 'hint', style: 'margin:0' }, '¿Qué falló? Así te digo qué hacer.'),
          h('div', { class: 'row', style: 'justify-content:center' },
            ...FAIL_REASONS.map((r) => button(r.label, { variant: 'outline', onClick: () => rep(false, r.id) })),
            button('No sé', { variant: 'ghost', onClick: () => rep(false) }),
          ),
        ) : null,
        msg,
        cfg.diag ? h('div', { class: 'feedback bad stack' },
          h('strong', {}, `Patrón: ${cfg.diag.label} (${cfg.diag.count} fallos)`),
          h('span', {}, cfg.diag.text),
          h('div', { class: 'row' },
            button(`Bajar a ${cfg.diag.bpm} bpm`, { variant: 'accent', onClick: () => { cfg.ladder = { ...cfg.ladder, bpm: cfg.diag.bpm, streak: 0, fails: 0, reasons: {} }; cfg.bpm = cfg.diag.bpm; cfg.diag = null; bpmOut.textContent = `${cfg.bpm} bpm`; drawLadder(); } }),
            cfg.diag.drill && cfg.diag.drill !== cfg.drill ? button('Trabajar el drill específico', { variant: 'outline', onClick: () => ctx.go('drills', { drill: cfg.diag.drill }) }) : null,
          ),
        ) : null,
        h('details', {}, h('summary', {}, 'Ajustar la escalera'),
          h('div', { class: 'stack' },
            slider({ min: 30, max: 240, value: l.start, label: 'Inicio', format: (v) => `${v}`, onInput: (v) => { cfg.ladder.start = v; if (cfg.ladder.bpm < v) { cfg.ladder.bpm = v; cfg.bpm = v; bpmOut.textContent = `${v} bpm`; } } }),
            slider({ min: 40, max: 300, value: l.target, label: 'Objetivo', format: (v) => `${v}`, onInput: (v) => { cfg.ladder.target = v; } }),
            slider({ min: 1, max: 12, value: l.step, label: 'Subida', format: (v) => `+${v}`, onInput: (v) => { cfg.ladder.step = v; } }),
            slider({ min: 1, max: 8, value: l.reps, label: 'Repeticiones limpias', format: (v) => `${v}`, onInput: (v) => { cfg.ladder.reps = v; } }),
            button('Reiniciar escalera', { variant: 'ghost', onClick: () => { cfg.ladder = { ...newLadder({ start: l.start, target: l.target, step: l.step, reps: l.reps }), drillId: l.drillId }; cfg.bpm = cfg.ladder.start; showMsg(''); drawLadder(); } }),
          ),
        ),
      );
    } else if (cfg.mode === 'burst') {
      ladderBox.append(
        slider({ min: 30, max: 260, value: cfg.bpm, label: 'Tu tempo cómodo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; bpmOut.textContent = `${v} bpm`; } }),
        h('p', { class: 'hint' }, 'Práctica en ráfagas: dos pasadas lentas y limpias, una ráfaga rápida, y vuelta a empezar. Entrena el movimiento rápido sin perder la limpieza.'),
      );
    } else {
      ladderBox.append(slider({ min: 30, max: 300, value: cfg.bpm, label: 'Tempo', format: (v) => `${v} bpm`, onInput: (v) => { cfg.bpm = v; bpmOut.textContent = `${v} bpm`; } }));
    }
  }

  function drawHistory() {
    clear(historyBox);
    const series = bestSeries(history, cfg.drill);
    const records = topRecords(history, 5);
    const blocks = [h('h2', {}, 'Tus récords')];
    if (series.length) {
      const w = 320;
      const ht = 90;
      const max = Math.max(...series.map((p) => p.bpm), 1);
      const min = Math.min(...series.map((p) => p.bpm));
      const pts = series.map((p, i) => {
        const x = series.length === 1 ? w / 2 : 10 + (i / (series.length - 1)) * (w - 20);
        const y = ht - 10 - ((p.bpm - min) / Math.max(1, max - min)) * (ht - 24);
        return [x, y, p];
      });
      const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const svg = h('div', { class: 'timeline' });
      svg.innerHTML = `<svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="BPM limpio por día"><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2"/>${pts.map(([x, y, p]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="currentColor"><title>${p.date}: ${p.bpm} bpm</title></circle>`).join('')}</svg>`;
      blocks.push(h('p', { class: 'hint' }, `${built.drill.title}: récord ${history[cfg.drill].best} bpm (${history[cfg.drill].bestDate}).`), svg);
      if (isPlateau(history, cfg.drill, dateKey())) blocks.push(h('p', { class: 'feedback bad' }, 'Llevas más de dos semanas sin batir tu récord. Prueba el modo «Ráfagas» o baja 10 bpm y reconstruye.'));
    } else {
      blocks.push(h('p', { class: 'hint' }, 'Aún no tienes tempos limpios en este ejercicio. Pulsa «Salió limpio» al terminar una repetición sin fallos.'));
    }
    if (records.length) {
      blocks.push(h('div', { class: 'pills' }, ...records.map((r) => h('span', { class: 'pill', title: r.date }, `${drillById(r.id).title.split(':')[0]} · ${r.best}`))));
    }
    historyBox.append(...blocks);
  }

  /* ─── Reproducción ─── */
  async function start() {
    await engine.ensure();
    const events = built.events;
    const perBeat = cfg.sub;
    loops = 0;
    cfg.planIdx = 0;
    cfg.planLoops = 0;
    if (cfg.mode === 'burst') {
      cfg.plan = burstPlan({ bpm: cfg.bpm, step: 8 });
      cfg.bpm = cfg.plan[0].bpm;
    }
    await transport.start({
      stepSeconds: () => 60 / cfg.bpm / perBeat,
      tick: (step, time) => {
        const i = step % events.length;
        if (i === 0 && step > 0) {
          loops += 1;
          if (cfg.mode === 'burst') {
            cfg.planLoops += 1;
            if (cfg.planLoops >= cfg.plan[cfg.planIdx].bars) {
              cfg.planIdx += 1;
              cfg.planLoops = 0;
              if (cfg.planIdx >= cfg.plan.length) { engine.at(time, () => transport.stop()); return false; }
              cfg.bpm = cfg.plan[cfg.planIdx].bpm;
            }
          }
        }
        if (i === 0) {
          const label = cfg.mode === 'burst' ? `${cfg.plan[cfg.planIdx].label} · ${cfg.bpm} bpm` : `Repetición ${loops + 1}`;
          engine.at(time, () => { loopOut.textContent = label; bpmOut.textContent = `${cfg.bpm} bpm`; });
        }
        const ev = events[i];
        const midi = eventMidi(tuning, ev);
        engine.pluck(midi, time, {
          dur: (60 / cfg.bpm / perBeat) * 1.6,
          vel: ev.art === 'H' || ev.art === 'P' || ev.art === 'T' ? 0.6 : ev.pick === 'D' || ev.pick == null ? 0.85 : 0.72,
          legato: ev.art === 'H' || ev.art === 'P' || ev.art === 'T',
          mute: ev.art === 'M',
        });
        if (i % perBeat === 0) engine.click(time, { accent: (i / perBeat) % 4 === 0, sound: 'click', vol: 0.5 });
        engine.at(time, () => score.seekBeat(i));
        return true;
      },
    });
  }

  /* ─── Selector de ejercicio ─── */
  const list = h('div', { class: 'stack' });
  function drawList() {
    clear(list);
    for (const g of DRILL_GROUPS) {
      const items = DRILL_LIST.filter((d) => d.group === g.id);
      list.append(h('div', { class: 'stack' }, h('span', { class: 'legend' }, g.label), ...items.map((d) => {
        const b = h('button', { type: 'button', class: `drill-item ${d.id === cfg.drill ? 'is-active' : ''}` }, d.title, history[d.id] ? h('span', { class: 'pill' }, `${history[d.id].best}`) : null);
        b.addEventListener('click', () => {
          transport.stop();
          cfg.drill = d.id;
          cfg.ladder = null;
          showMsg('');
          ctx.storage.set('drill-id', d.id);
          ctx.setParams({ drill: d.id });
          rebuild();
          drawList();
        });
        return b;
      })));
    }
  }

  root.append(
    header('Practicar', 'Drills técnicos', 'Ejercicios de púa, legato, independencia, hybrid, tapping y silenciado. Sube el tempo con la escalera de velocidad, entrena en ráfagas y guarda tus récords.'),
    h('div', { class: 'tool-grid' },
      h('section', { class: 'panel stack' }, h('h2', {}, 'Ejercicios'), list),
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' }, info, scoreToolbar(score, { playback: false, stave: true }), tabBox,
          h('p', { class: 'hint' }, 'Sobre cada nota: flecha de púa (abajo/arriba), dedo de la mano izquierda (1-4), ligado (arco), tap (T) y palm mute (P.M.). El cursor naranja sigue el ejercicio mientras suena.')),
        h('section', { class: 'panel stack' }, ladderBox, h('div', { class: 'row', style: 'justify-content:center' }, play.el)),
        h('section', { class: 'panel stack' }, historyBox),
      ),
    ),
  );
  rebuild();
  drawList();
}

export default {
  id: 'drills',
  title: 'Drills técnicos',
  group: 'practice',
  icon: '⚙',
  summary: 'Púa, legato, independencia, hybrid y tapping con escalera de velocidad y récords.',
  isNew: true,
  mount,
};
