/** Practice Log: minutos por día, racha, vista de 16 semanas, hitos y notas diarias. */

import {
  MILESTONES, achieved, addMinutes, weekMinutes, weeklyGoal, currentStreak, dateKey, formatMinutes, intensity, longestStreak, minutesOn, parseKey, setNote, totalMinutes, totalsByTool, weekGrid,
} from '../core/practice.js';
import { button, clear, h, segmented, slider } from '../ui/dom.js';
import { saveBlob } from '../ui/export.js';
import { header } from './common.js';
import { nextFocus, skillRadar } from '../core/skills.js';
import { topRecords } from '../core/speed.js';
import { drillById } from '../core/drills.js';

const TOOL_NAMES = {
  navigator: 'Navigator', exercises: 'Ejercicios', metronome: 'Metrónomo', drums: 'Caja de ritmos', strum: 'Rasgueo',
  rhythm: 'Ritmo', vibrato: 'Vibrato', backing: 'Backing', quiz: 'Theory Trainer', ear: 'Oído', tab: 'Tabs',
  eq: 'EQ', tuner: 'Afinador', manual: 'Manual', randomiser: 'Randomiser', chords: 'Acordes', capo: 'Capo', jam: 'Jam Studio', triads: 'Triad Lab', routine: 'Rutina', audiolab: 'Audio Lab',
  timing: 'Timing Lab', drills: 'Drills', bendlab: 'Bends y vibrato', recorder: 'Autograbación', licks: 'Licks', blind: 'Mástil a ciegas',
};

function mount(root, ctx) {
  /** Radar de cinco ejes + récords + siguiente tarea recomendada. */
  function radarPanel(practiceState) {
    const speed = ctx.storage.get('speed-history', {});
    const radar = skillRadar({
      timing: ctx.storage.get('timing-history', []),
      pitch: ctx.storage.get('pitch-history', []),
      quiz: ctx.storage.get('quiz-stats', null),
      speed,
      practice: practiceState,
    });
    const size = 300;
    const c = size / 2;
    const R = 105;
    const pt = (i, frac) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / radar.length;
      return [c + Math.cos(a) * R * frac, c + Math.sin(a) * R * frac];
    };
    const ring = (f) => radar.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(',')).join(' ');
    const shape = radar.map((a, i) => pt(i, (a.value ?? 0) / 100).map((v) => v.toFixed(1)).join(',')).join(' ');
    const labels = radar.map((a, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="currentColor">${a.label}${a.value == null ? ' –' : ` ${a.value}`}</text>`; }).join('');
    const el = h('div', { class: 'radar' });
    el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar de habilidades">${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" stroke="currentColor" opacity=".18"/>`).join('')}<polygon points="${shape}" fill="var(--orange)" fill-opacity=".35" stroke="var(--orange-dark)" stroke-width="2"/>${labels}</svg>`;
    const focus = nextFocus(radar);
    const records = topRecords(speed, 5);
    return h('section', { class: 'panel stack' },
      h('h2', {}, 'Tu nivel por habilidad'),
      el,
      h('p', {}, `Siguiente paso recomendado: ${focus.label} (${focus.reason}). ${focus.hint}`),
      h('div', { class: 'row' }, button(`Ir a ${focus.label}`, { variant: 'accent', onClick: () => ctx.go(focus.tool) })),
      records.length ? h('div', { class: 'stack' }, h('span', { class: 'legend' }, 'Récords de velocidad (bpm limpios)'), h('div', { class: 'pills' }, ...records.map((r) => h('span', { class: 'pill', title: r.date }, `${drillById(r.id).title.split(':')[0]} · ${r.best}`)))) : null,
      h('div', { class: 'field' }, h('span', { class: 'legend' }, 'Recordatorio de pausas (cada 20 min tocando)'), segmented([{ value: 'on', label: 'Activado' }, { value: 'off', label: 'Desactivado' }], ctx.storage.get('break-reminder', true) ? 'on' : 'off', (v) => ctx.storage.set('break-reminder', v === 'on'))),
    );
  }

  const body = h('div', { class: 'stack' });
  const today = dateKey();
  let selected = today;

  function fullBackup() {
    const items = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('lab:')) items[key.slice(4)] = JSON.parse(localStorage.getItem(key));
      }
    } catch { /* sin almacenamiento */ }
    items.practice = state();
    return { app: 'mastil-lab', version: 1, date: new Date().toISOString(), items };
  }

  function state() {
    return ctx.practice.state;
  }

  function render() {
    clear(body);
    const s = state();
    const streak = currentStreak(s);
    const grid = weekGrid(s, today, 16);
    const heat = h('div', { class: 'heat', role: 'img', 'aria-label': 'Actividad de las últimas 16 semanas' });
    for (const col of grid) {
      for (const day of col) {
        const cell = h('i', {
          dataset: { l: intensity(day.minutes, s.goal) },
          class: `${day.future ? 'future' : ''} ${day.key === today ? 'today' : ''}`,
          title: `${parseKey(day.key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatMinutes(day.minutes)}`,
          style: 'cursor:pointer',
        });
        cell.addEventListener('click', () => { selected = day.key; render(); });
        heat.append(cell);
      }
    }
    const byTool = Object.entries(totalsByTool(s)).sort((a, b) => b[1] - a[1]);
    const maxTool = byTool[0]?.[1] ?? 1;
    const got = new Set(achieved(s).map((m) => m.id));
    const day = s.days[selected] ?? { minutes: 0, tools: {}, note: '' };
    const noteArea = h('textarea', { rows: 3, placeholder: '¿Qué has trabajado? ¿Qué te costó?', 'aria-label': 'Nota del día' }, day.note ?? '');
    noteArea.addEventListener('change', () => ctx.practice.replace(setNote(state(), selected, noteArea.value)));

    body.append(
      h('div', { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('strong', {}, formatMinutes(minutesOn(s, today))), h('span', {}, 'hoy')),
        h('div', { class: 'stat' }, h('strong', {}, `${streak}`), h('span', {}, 'días de racha')),
        h('div', { class: 'stat' }, h('strong', {}, `${longestStreak(s)}`), h('span', {}, 'mejor racha')),
        h('div', { class: 'stat' }, h('strong', {}, formatMinutes(totalMinutes(s))), h('span', {}, 'total')),
      ),
      radarPanel(s),
      h('section', { class: 'panel stack' },
        h('h2', {}, 'Registro rápido'),
        h('div', { class: 'row' }, [5, 10, 15, 30, 60].map((m) => button(`+${m} min`, { variant: 'outline', onClick: () => { ctx.practice.replace(addMinutes(state(), selected, m, 'manual')); render(); ctx.toast(`+${m} min anotados`); } }))),
        h('p', { class: 'hint' }, `Día seleccionado: ${parseKey(selected).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatMinutes(day.minutes)}. El metrónomo, el backing, los ejercicios y los entrenadores anotan su tiempo solos.`),
        noteArea,
        slider({ min: 5, max: 120, step: 5, value: s.goal, label: 'Meta diaria', format: (v) => `${v} min`, onInput: (v) => { ctx.practice.replace({ ...state(), goal: v }); } }),
        slider({ min: 30, max: 840, step: 30, value: weeklyGoal(s), label: 'Meta semanal', format: (v) => `${v} min`, onInput: (v) => { ctx.practice.replace({ ...state(), weeklyGoal: v }); } }),
        h('div', {}, h('div', { class: 'row row--between' }, h('span', {}, 'Esta semana'), h('strong', {}, `${formatMinutes(weekMinutes(s, today))} de ${formatMinutes(weeklyGoal(s))}`)), h('div', { class: 'progress' }, h('i', { style: `width:${Math.min(100, (weekMinutes(s, today) / Math.max(1, weeklyGoal(s))) * 100)}%` }))),
      ),
      h('section', { class: 'panel' }, h('h2', {}, 'Últimas 16 semanas'), heat, h('p', { class: 'hint' }, 'Cada columna es una semana (lunes a domingo). Más oscuro = más minutos respecto a tu meta. Pulsa un día para anotar en él.')),
      h('div', { class: 'grid-2', style: 'align-items:start' },
        h('section', { class: 'panel stack' }, h('h2', {}, 'Dónde practicas'),
          byTool.length ? byTool.map(([tool, min]) => h('div', {}, h('div', { class: 'row row--between' }, h('span', {}, TOOL_NAMES[tool] ?? tool), h('strong', {}, formatMinutes(min))), h('div', { class: 'progress' }, h('i', { style: `width:${(min / maxTool) * 100}%` })))) : h('p', { class: 'hint' }, 'Todavía no hay datos.'),
        ),
        h('section', { class: 'panel' }, h('h2', {}, 'Hitos'), h('div', { class: 'row' }, MILESTONES.map((m) => h('span', { class: `badge ${got.has(m.id) ? 'is-got' : ''}` }, got.has(m.id) ? '★' : '☆', m.label)))),
      ),
      h('section', { class: 'panel row' },
        button('Exportar copia (JSON)', { variant: 'outline', onClick: () => saveBlob(new Blob([JSON.stringify(state(), null, 2)], { type: 'application/json' }), 'mastil-lab-practica.json', 'Copia de práctica') }),
        h('label', { class: 'btn btn-outline' }, 'Importar copia', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            if (data && typeof data.days === 'object') { ctx.practice.replace({ goal: 15, ...data }); render(); ctx.toast('Copia importada'); }
            else ctx.toast('El archivo no es válido');
          } catch { ctx.toast('El archivo no es válido'); }
        } })),
        button('Copia de seguridad completa', { variant: 'outline', title: 'Práctica, quiz, tabs, bases, marcadores y ajustes', onClick: () => saveBlob(new Blob([JSON.stringify(fullBackup(), null, 2)], { type: 'application/json' }), 'mastil-lab-copia-completa.json', 'Copia completa') }),
        h('label', { class: 'btn btn-outline' }, 'Restaurar copia completa', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const data = JSON.parse(await file.text());
            if (!data || data.app !== 'mastil-lab' || typeof data.items !== 'object') { ctx.toast('No es una copia completa de Mástil Lab'); return; }
            if (!confirm('Se sustituirán tus datos actuales por los de la copia. ¿Continuar?')) return;
            for (const [key, value] of Object.entries(data.items)) ctx.storage.set(key, value);
            ctx.toast('Copia restaurada; recargando…');
            setTimeout(() => location.reload(), 600);
          } catch { ctx.toast('El archivo no es válido'); }
        } })),
        button('Borrar todo', { variant: 'ghost', onClick: () => { if (confirm('¿Borrar todo el registro de práctica?')) { ctx.practice.replace({ days: {}, goal: 15 }); render(); } } }),
      ),
    );
  }

  root.append(header('Practicar', 'Practice Log', 'Tu constancia importa más que la intensidad. Anota minutos, mantén la racha y mira cómo crece tu práctica semana a semana. Todo se guarda sólo en este navegador.'), body);
  render();
}

export default {
  id: 'log',
  title: 'Practice Log',
  group: 'practice',
  icon: '▤',
  summary: 'Racha, 16 semanas de actividad, hitos, notas diarias y exportación de tu registro.',
  isNew: true,
  mount,
};
