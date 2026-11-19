/**
 * Repertorio: canciones con estado, secciones con tempo y repaso espaciado.
 * Reutiliza las cajas de `srs.js`. Puro.
 */

import { reviewCard, isDue } from './srs.js';

export const SONG_STATUS = [
  { id: 'learning', label: 'Aprendiendo' },
  { id: 'tempo', label: 'A tempo' },
  { id: 'memorized', label: 'De memoria' },
];

const VALID = new Set(SONG_STATUS.map((s) => s.id));

let counter = 0;
const newId = () => `song-${Date.now().toString(36)}-${(counter += 1)}`;

/** Crea una canción. `sections` puede ser un texto «Intro, Estrofa, Estribillo». */
export function newSong({ title, artist = '', targetBpm = 100, sections = 'Intro, Estrofa, Estribillo', now = Date.now() }) {
  const names = Array.isArray(sections) ? sections : String(sections).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return {
    id: newId(),
    title: String(title).trim() || 'Sin título',
    artist: String(artist).trim(),
    targetBpm: Math.max(30, Math.min(300, Math.round(targetBpm))),
    status: 'learning',
    sections: (names.length ? names : ['Canción completa']).map((name) => ({ name, bpm: 0, clean: false })),
    card: null,
    addedAt: now,
    reviews: 0,
  };
}

/** Siguiente tempo de práctica de una sección: empieza al 60 % y sube un ~8 %. */
export function nextSectionBpm(song, section) {
  if (!section.bpm) return Math.max(30, Math.round(song.targetBpm * 0.6));
  return Math.min(song.targetBpm, Math.round(section.bpm * 1.08) + 1);
}

/** Anota que una sección salió limpia a `bpm`. Si todas llegan al objetivo → «a tempo». */
export function markSectionClean(song, index, bpm) {
  const sections = song.sections.map((s, i) => (i === index ? { ...s, bpm: Math.max(s.bpm, Math.round(bpm)), clean: Math.max(s.bpm, bpm) >= song.targetBpm } : s));
  const allDone = sections.every((s) => s.clean);
  return { ...song, sections, status: allDone && song.status === 'learning' ? 'tempo' : song.status };
}

export function setStatus(song, status) {
  return VALID.has(status) ? { ...song, status } : song;
}

/** Progreso 0–1: media de tempo logrado / objetivo en las secciones. */
export function songProgress(song) {
  if (song.status === 'memorized') return 1;
  if (!song.sections.length) return 0;
  return song.sections.reduce((s, x) => s + Math.min(1, x.bpm / song.targetBpm), 0) / song.sections.length;
}

/** Repaso espaciado: «¿la toqué bien hoy de memoria?». */
export function reviewSong(song, ok, now = Date.now()) {
  const card = reviewCard(song.card, ok, now);
  let status = song.status;
  if (ok && status === 'tempo' && card.box >= 3) status = 'memorized';
  if (!ok && status === 'memorized') status = 'tempo';
  return { ...song, card, status, reviews: song.reviews + 1 };
}

/** Canciones por repasar hoy (las que ya no están «aprendiendo»). */
export function dueSongs(songs, now = Date.now()) {
  return songs.filter((s) => s.status !== 'learning' && isDue(s.card, now));
}

export function repertoireStats(songs) {
  const by = { learning: 0, tempo: 0, memorized: 0 };
  for (const s of songs) if (s.status in by) by[s.status] += 1;
  return { total: songs.length, ...by };
}

/** Canción más urgente: vencida > en aprendizaje con menos progreso. */
export function nextSong(songs, now = Date.now()) {
  const due = dueSongs(songs, now);
  if (due.length) return { song: due[0], why: 'Toca repasarla de memoria hoy.' };
  const learning = songs.filter((s) => s.status === 'learning').sort((a, b) => songProgress(a) - songProgress(b));
  if (learning.length) return { song: learning[0], why: 'Es la que menos avanzada tienes.' };
  return null;
}
