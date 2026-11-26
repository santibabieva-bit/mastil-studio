/**
 * Informe de digitaciones: imprime todas las digitaciones que genera el Lab
 * (Biblioteca de ejercicios, arpegios, cajas pentatónicas y de blues, escalas
 * por posición, drills y tríadas) para revisarlas a mano o con el agente
 * «fingering-reviewer».
 *
 *   node scripts/fingering-report.mjs            → todo, en la tonalidad de La
 *   node scripts/fingering-report.mjs C pent     → tónica Do, solo ids que contengan «pent»
 *
 * Formato por ejercicio: una línea por cuerda (1 = aguda) con «traste/dedo»
 * en orden de aparición, más el estiramiento máximo por cuerda y por posición.
 */

import { EXERCISES, buildExercise } from '../lab/js/core/exlib.js';
import { arpeggioPositions } from '../lab/js/core/triads.js';
import { positionLabel } from '../lab/js/core/exercises.js';
import { createNoteCollection, TUNINGS, parseRoot } from '../lab/js/core/music.js';
import { DRILL_LIST as DRILLS } from '../lab/js/core/drills.js';

const tuning = TUNINGS.standard.midi;
const root = process.argv[2] ?? 'A';
const filter = process.argv[3] ?? '';
const out = [];
const print = (s = '') => out.push(s);

function describe(notes) {
  const byString = new Map();
  for (const n of notes) {
    if (!byString.has(n.s)) byString.set(n.s, []);
    const list = byString.get(n.s);
    const tok = `${n.f}/${n.finger ?? '·'}`;
    if (list[list.length - 1] !== tok) list.push(tok);
  }
  const rows = [];
  for (let s = 0; s < tuning.length; s += 1) {
    const list = [...new Set(byString.get(s) ?? [])];
    rows.push(`  ${s + 1}: ${list.join(' ')}`);
  }
  const fretted = notes.filter((n) => n.f > 0);
  const span = fretted.length ? Math.max(...fretted.map((n) => n.f)) - Math.min(...fretted.map((n) => n.f)) + 1 : 0;
  // Incoherencias simples: mismo dedo en dos trastes de la misma cuerda, o dedo menor en traste mayor.
  const issues = [];
  for (const [s, list] of byString) {
    const pairs = [...new Set(list)].map((t) => t.split('/').map(Number));
    for (const [f1, d1] of pairs) {
      for (const [f2, d2] of pairs) {
        if (f1 < f2 && d1 >= d2 && d1 > 0 && d2 > 0) issues.push(`cuerda ${s + 1}: traste ${f1} dedo ${d1} vs traste ${f2} dedo ${d2}`);
      }
    }
  }
  return { rows, span, issues };
}

// Ejercicios en los que la mano se desplaza a propósito (pares de dobles cuerdas,
// aproximaciones cromáticas, cajas encadenadas): no se comprueban como una sola posición.
const MOVING = /^(dbl-|caged-|appr-|pent-chain)/;

function section(title, notes, extra = '') {
  const { rows, span, issues: all } = describe(notes);
  const issues = MOVING.test(title) ? [] : all;
  if (MOVING.test(title)) rows.push('  (la mano se desplaza: dedos por par o por caja)');
  print(`### ${title}${extra ? ` — ${extra}` : ''}`);
  print(`  trastes que abarca: ${span}`);
  rows.forEach((r) => print(r));
  if (issues.length) print(`  ⚠ ${issues.join('; ')}`);
  print();
}

const posCount = (quality) => positionLabel(tuning, createNoteCollection(root, 'scale', quality), 0).count;

print(`# Informe de digitaciones (tónica ${root}, afinación estándar)`);
print();
for (const ex of EXERCISES) {
  if (filter && !ex.id.includes(filter) && ex.family !== filter) continue;
  const base = { tuning, root, direction: 'up', maxFret: 17 };
  if (ex.family === 'pent') {
    for (const pent of ['minor', 'major', 'blues']) {
      const q = pent === 'major' ? 'pentatonicMajor' : pent === 'blues' ? 'blues' : 'pentatonicMinor';
      const count = ex.needsPosition ? posCount(q) : 1;
      for (let position = 0; position < count; position += 1) {
        const r = buildExercise(ex.id, { ...base, pent, position });
        section(`${ex.id} (${ex.title})`, r.beats.flatMap((b) => b.notes), `${pent}, posición ${position + 1}`);
      }
    }
  } else if (ex.family === 'arp') {
    for (const chord of ['maj', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim7']) {
      const rootPc = parseRoot(root).pc;
      const n = arpeggioPositions({ tuning, rootPc, typeId: chord, width: 5, maxFret: 15 }).length;
      for (let arpPos = 0; arpPos < n; arpPos += 1) {
        const r = buildExercise(ex.id, { ...base, chord, arpPos });
        section(`${ex.id} (${ex.title})`, r.beats.flatMap((b) => b.notes), `${root}${chord}, posición ${arpPos + 1}`);
      }
    }
  } else if (ex.needsPosition) {
    for (const quality of ['major', 'naturalMinor']) {
      const count = posCount(quality);
      for (let position = 0; position < Math.min(count, 7); position += 1) {
        const r = buildExercise(ex.id, { ...base, quality, position });
        section(`${ex.id} (${ex.title})`, r.beats.flatMap((b) => b.notes), `${quality}, posición ${position + 1}`);
      }
    }
  } else {
    try {
      const r = buildExercise(ex.id, base);
      section(`${ex.id} (${ex.title})`, r.beats.flatMap((b) => b.notes), ex.family);
    } catch (e) {
      print(`### ${ex.id}: error ${e.message}`);
    }
  }
}

print('# Drills');
print();
for (const d of DRILLS) {
  if (filter && !d.id.includes(filter) && filter !== 'drills') continue;
  try {
    const ev = d.build({ tuning, root: parseRoot(root).pc, quality: 'm', startFret: 5 });
    section(`drill ${d.id} (${d.title})`, ev.filter((e) => e.f != null).map((e) => ({ s: e.s, f: e.f, finger: e.finger })), d.group);
  } catch (e) {
    print(`### drill ${d.id}: error ${e.message}`);
  }
}
console.log(out.join('\n'));
