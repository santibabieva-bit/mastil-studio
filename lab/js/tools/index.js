/** Registro de herramientas del Lab. */

import navigator from './navigator.js';
import quiz from './quiz.js';
import chords from './chords.js';
import exercises from './exercises.js';
import metronome from './metronome.js';
import strum from './strum.js';
import rhythm from './rhythmTrainer.js';
import vibrato from './vibrato.js';
import log from './log.js';
import backing from './backing.js';
import tab from './tabCreator.js';
import randomiser from './randomiser.js';
import capo from './capo.js';
import ear from './ear.js';
import eq from './eq.js';
import tuner from './tuner.js';
import reference from './reference.js';
import jam from './jam.js';
import triads from './triads.js';
import routine from './routine.js';
import audiolab from './audiolab.js';

export const GROUPS = [
  { id: 'neck', label: 'Aprender el mástil' },
  { id: 'practice', label: 'Practicar' },
  { id: 'play', label: 'Tocar y escribir' },
  { id: 'ears', label: 'Oído y afinación' },
  { id: 'ref', label: 'Referencia' },
];

export const TOOLS = [
  navigator, triads, quiz, chords,
  routine, exercises, audiolab, metronome, strum, rhythm, vibrato, log,
  jam, backing, tab, randomiser, capo,
  ear, eq, tuner,
  reference,
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
