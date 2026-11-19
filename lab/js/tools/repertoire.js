/**
 * Repertorio: tus canciones con estado (aprendiendo → a tempo → de memoria),
 * práctica por secciones con tempo creciente y repaso espaciado.
 */

import {
  SONG_STATUS, dueSongs, markSectionClean, newSong, nextSectionBpm, nextSong, repertoireStats, reviewSong, setStatus, songProgress,
} from '../core/repertoire.js';
import {
  button, clear, h, segmented,
} from '../ui/dom.js';
import { header } from './common.js';

const STATUS_LABEL = Object.fromEntries(SONG_STATUS.map((s) => [s.id, s.label]));

function mount(root, ctx) {
  let songs = ctx.storage.get('repertoire', []);
  const form = { title: '', artist: '', bpm: 100, sections: 'Intro, Estrofa, Estribillo' };
  const list = h('div', { class: 'stack' });
  const top = h('div', { class: 'stack' });

  const save = () => { ctx.storage.set('repertoire', songs); render(); };
  const update = (id, fn) => { songs = songs.map((s) => (s.id === id ? fn(s) : s)); save(); };

  function addSong() {
    if (!form.title.trim()) { ctx.toast('Ponle un título a la canción'); return; }
    songs = [newSong({ title: form.title, artist: form.artist, targetBpm: Number(form.bpm) || 100, sections: form.sections }), ...songs];
    form.title = '';
    form.artist = '';
    save();
  }

  const input = (label, key, attrs = {}) => {
    const el = h('input', { class: 'input', value: form[key], ...attrs });
    el.addEventListener('input', () => { form[key] = el.value; });
    return h('div', { class: 'field' }, h('label', {}, label), el);
  };

  function songCard(song) {
    const progress = Math.round(songProgress(song) * 100);
    const due = dueSongs([song]).length > 0;
    return h('section', { class: 'panel stack' },
      h('div', { class: 'row row--between' },
        h('h2', { style: 'margin:0' }, song.title, song.artist ? h('span', { class: 'hint' }, ` · ${song.artist}`) : null),
        h('span', { class: 'pill' }, STATUS_LABEL[song.status]),
      ),
      h('div', { class: 'progress' }, h('i', { style: `width:${progress}%` })),
      h('p', { class: 'hint' }, `Objetivo ${song.targetBpm} bpm · progreso ${progress} %${song.reviews ? ` · ${song.reviews} repasos` : ''}`),
      song.status === 'learning'
        ? h('div', { class: 'stack' }, ...song.sections.map((sec, i) => {
          const next = nextSectionBpm(song, sec);
          return h('div', { class: 'row row--between' },
            h('span', {}, `${sec.clean ? '✓ ' : ''}${sec.name}`, h('span', { class: 'hint' }, sec.bpm ? ` · mejor ${sec.bpm} bpm` : ' · sin empezar')),
            h('span', { class: 'row' },
              button(`▶ ${next} bpm`, { variant: 'outline', title: 'Abre el metrónomo a ese tempo', onClick: () => ctx.go('metronome', { bpm: next }) }),
              button('✓ Limpia', { variant: 'accent', onClick: () => update(song.id, (s) => markSectionClean(s, i, next)) }),
            ));
        }))
        : h('div', { class: 'row' },
          due ? h('p', { class: 'feedback bad', style: 'margin:0' }, 'Toca repasarla hoy: tócala entera de memoria.') : h('p', { class: 'hint', style: 'margin:0' }, 'Al día. Vuelve a repasarla cuando toque.'),
          button('✓ La toqué de memoria', { variant: 'accent', onClick: () => update(song.id, (s) => reviewSong(s, true)) }),
          button('✗ Me falló', { variant: 'outline', onClick: () => update(song.id, (s) => reviewSong(s, false)) }),
        ),
      h('div', { class: 'row' },
        segmented(SONG_STATUS.map((s) => ({ value: s.id, label: s.label })), song.status, (v) => update(song.id, (s) => setStatus(s, v))),
        button('Eliminar', { variant: 'ghost', onClick: () => { if (confirm(`¿Eliminar «${song.title}» del repertorio?`)) { songs = songs.filter((s) => s.id !== song.id); save(); } } }),
      ),
    );
  }

  function render() {
    clear(top);
    clear(list);
    const st = repertoireStats(songs);
    const nxt = nextSong(songs);
    top.append(
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(st.learning)), h('div', { class: 'hint' }, 'Aprendiendo')),
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(st.tempo)), h('div', { class: 'hint' }, 'A tempo')),
        h('div', { class: 'stat' }, h('div', { class: 'big-number' }, String(st.memorized)), h('div', { class: 'hint' }, 'De memoria')),
      ),
      nxt ? h('p', { class: 'feedback ok' }, `Hoy: «${nxt.song.title}». ${nxt.why}`) : h('p', { class: 'hint' }, 'Añade tu primera canción abajo.'),
    );
    for (const s of songs) list.append(songCard(s));
  }

  root.append(
    header('Practicar', 'Repertorio', 'Las canciones son el mejor termómetro: si la tocas entera, a tempo y de memoria, lo que has practicado funciona. Aprende por secciones, sube el tempo poco a poco y repasa con repetición espaciada.'),
    h('div', { class: 'tool-grid' },
      h('div', { class: 'stack' }, top, list),
      h('section', { class: 'panel stack' }, h('h2', {}, 'Añadir canción'),
        input('Título', 'title', { placeholder: 'p. ej. Wonderwall' }),
        input('Artista (opcional)', 'artist'),
        input('Tempo objetivo (bpm)', 'bpm', { type: 'number', min: 30, max: 300 }),
        input('Secciones (separadas por comas)', 'sections'),
        button('Añadir al repertorio', { variant: 'accent', onClick: addSong }),
        h('p', { class: 'hint' }, 'Cada sección empieza al 60 % del tempo objetivo y sube un poco cada vez que sale limpia. Cuando todas llegan al objetivo, la canción pasa a «a tempo»; después se repasa de memoria con intervalos crecientes.'),
      ),
    ),
  );
  render();
}

export default {
  id: 'repertoire',
  title: 'Repertorio',
  group: 'practice',
  icon: '🎵',
  summary: 'Tus canciones por secciones con tempo creciente y repaso espaciado.',
  isNew: true,
  mount,
};
