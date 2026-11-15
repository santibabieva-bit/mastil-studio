/** Generador de riffs aleatorios (como tablatura) sobre una escala. */

import { pick } from './music.js';
import { ladderBox, ladderPerString, rootPosition } from './exercises.js';
import { createTab } from './tab.js';

export const TECH_OPTIONS = {
  legato: 'Ligados (h / p)',
  slides: 'Slides',
  bends: 'Bends',
  vibrato: 'Vibrato',
};

/**
 * @param {object} o
 * @param {number[]} o.tuning
 * @param {object} o.collection
 * @param {number} [o.length] columnas (corcheas)
 * @param {string[]} [o.techniques] claves de TECH_OPTIONS
 * @param {number} [o.restChance]
 * @param {function} [o.rng]
 */
export function generateRiff({ tuning, collection, length = 16, techniques = [], restChance = 0.15, rng = Math.random }) {
  let ladder = ladderPerString({ tuning, collection, position: rootPosition(tuning, collection), maxFret: 17 }).ladder;
  // Nos quedamos con las cuerdas centrales y agudas para que suene a riff.
  const rich = ladder.filter((n) => n.s <= tuning.length - 2);
  if (rich.length >= 6) ladder = rich;
  if (ladder.length < 5) ladder = ladderBox({ tuning, collection, startFret: 5, span: 5 }).ladder;

  const tab = createTab({ strings: tuning.length, cols: length, title: 'Riff aleatorio' });
  let index = Math.floor(ladder.length / 2);
  const events = [];
  for (let c = 0; c < length; c += 1) {
    const isRest = c > 0 && rng() < restChance;
    const strong = c % 4 === 0;
    if (isRest && !strong) {
      events.push(null);
      continue;
    }
    // Camino aleatorio con preferencia por movimientos pequeños.
    const step = pick([-2, -1, -1, 0, 1, 1, 2, 3, -3], rng);
    index = Math.max(0, Math.min(ladder.length - 1, index + step));
    if (strong && rng() < 0.35) index = Math.max(0, Math.min(ladder.length - 1, Math.round(ladder.length * 0.4)));
    events.push({ ...ladder[index] });
  }
  // Primera nota: tónica si existe cerca.
  const rootNote = ladder.find((n) => (n.midi % 12) === collection.root.pc);
  if (rootNote) events[0] = { ...rootNote };

  events.forEach((note, c) => {
    if (!note) return;
    let text = String(note.f);
    const next = events[c + 1];
    const sameString = next && next.s === note.s;
    if (techniques.includes('legato') && sameString && Math.abs(next.f - note.f) <= 3 && next.f !== note.f && rng() < 0.45) {
      text += next.f > note.f ? 'h' : 'p';
    } else if (techniques.includes('slides') && sameString && Math.abs(next.f - note.f) >= 2 && rng() < 0.35) {
      text += next.f > note.f ? '/' : '\\';
    } else if (techniques.includes('bends') && rng() < 0.12 && note.f > 0) {
      text += 'b';
    } else if (techniques.includes('vibrato') && !next && rng() < 0.8) {
      text += '~';
    }
    tab.cells[note.s][c] = text;
  });
  tab.subdivision = 2;
  return tab;
}

export const CHALLENGES = [
  { cat: 'Técnica', text: 'Toca la escala pentatónica menor a 60 bpm en corcheas, sin un solo ruido de cuerda. Sube 5 bpm sólo si sale limpia tres veces seguidas.' },
  { cat: 'Técnica', text: 'Haz ligados de tres notas (1-2-3) por cada cuerda, de la 6ª a la 1ª y de vuelta, con el metrónomo en negras.' },
  { cat: 'Técnica', text: 'Practica bends de un tono hasta que la nota llegue afinada: compara con la nota objetivo tocada en el traste correspondiente.' },
  { cat: 'Técnica', text: 'Toca la escala mayor en terceras (1-3, 2-4, 3-5…) en una posición, subiendo y bajando, a un tempo cómodo.' },
  { cat: 'Técnica', text: 'Púa alterna estricta: una nota por cuerda al aire, 4 minutos, sin cambiar el tempo.' },
  { cat: 'Técnica', text: 'Vibrato con el dedo 3 en la cuerda 2: 8 compases, ancho y lento; luego 8 compases estrecho y rápido.' },
  { cat: 'Técnica', text: 'Cambia entre dos acordes que te cuesten (por ejemplo F y Bm) 10 veces seguidas sin parar el tempo.' },
  { cat: 'Técnica', text: 'Toca un arpegio de tríada mayor por cuatro cuerdas diferentes subiendo por el mástil.' },
  { cat: 'Creatividad', text: 'Improvisa 8 compases usando sólo tres notas de la escala. Haz que cada frase termine en la tónica.' },
  { cat: 'Creatividad', text: 'Improvisa con la regla «pregunta y respuesta»: toca una frase de 2 compases y contéstala con otra distinta.' },
  { cat: 'Creatividad', text: 'Toca una melodía conocida (cumpleaños, himno…) de oído en tres tonalidades distintas.' },
  { cat: 'Creatividad', text: 'Improvisa sólo en la 2ª y 3ª cuerda durante 3 minutos. Limita el espacio, gana ideas.' },
  { cat: 'Creatividad', text: 'Escribe un riff de 4 compases y varíalo: cambia el ritmo, luego las notas, luego la octava.' },
  { cat: 'Creatividad', text: 'Improvisa dejando silencios: cada frase debe tener al menos un compás de descanso después.' },
  { cat: 'Creatividad', text: 'Toca la misma frase en cinco posiciones distintas del mástil.' },
  { cat: 'Ritmo', text: 'Toca sólo contratiempos (el «&») con un acorde apagado durante 3 minutos.' },
  { cat: 'Ritmo', text: 'Con el metrónomo en 60 bpm, toca la escala en semicorcheas, luego en tresillos, luego en cuatrillos de corchea.' },
  { cat: 'Ritmo', text: 'Entrenador de silencios: pon el metrónomo con 2 compases sonando y 2 en silencio, y entra siempre justo.' },
  { cat: 'Ritmo', text: 'Practica un patrón de rasgueo nuevo durante 5 minutos antes de usarlo en una canción.' },
  { cat: 'Ritmo', text: 'Cuenta en voz alta «1 e & a» mientras tocas un riff sencillo.' },
  { cat: 'Oído', text: 'Saca de oído los primeros 4 compases de una canción que conozcas, sin mirar tabs.' },
  { cat: 'Oído', text: 'Elige una nota al azar, tócala y canta la 3ª mayor y la 5ª justa sobre ella antes de tocarlas.' },
  { cat: 'Oído', text: 'Identifica a oído si una progresión que escuches es mayor o menor, y después su tonalidad.' },
  { cat: 'Oído', text: 'Toca las tres primeras notas de una melodía y deduce el resto sin ayuda.' },
  { cat: 'Mástil', text: 'Encuentra todas las notas Fa♯ del mástil en menos de 30 segundos.' },
  { cat: 'Mástil', text: 'Toca la escala de La menor pentatónica en las cinco posiciones, unidas, de grave a agudo y vuelta.' },
  { cat: 'Mástil', text: 'Toca el acorde de Do mayor en cinco sitios distintos del mástil.' },
  { cat: 'Mástil', text: 'Toca la escala mayor en una sola cuerda, de la cejilla al traste 12.' },
  { cat: 'Mástil', text: 'Nombra en voz alta cada nota que tocas mientras subes la escala cromática por la 6ª cuerda.' },
  { cat: 'Repertorio', text: 'Toca una canción completa de principio a fin sin parar, aunque te equivoques. Lo importante es seguir.' },
  { cat: 'Repertorio', text: 'Aprende el solo de una canción a mitad de velocidad y sube 5 bpm cada día.' },
  { cat: 'Repertorio', text: 'Graba 1 minuto de tu tocar con el móvil y escucha qué mejorarías.' },
];

export function randomChallenge(rng = Math.random, category = null) {
  const pool = category ? CHALLENGES.filter((c) => c.cat === category) : CHALLENGES;
  return pick(pool, rng);
}
