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
import timing from './timing.js';
import drills from './drills.js';
import bendlab from './bendlab.js';
import recorder from './recorder.js';
import licks from './licks.js';
import blind from './blind.js';
import score from './score.js';
import exlib from './exlib.js';
import earplay from './earplay.js';
import repertoire from './repertoire.js';
import curriculum from './curriculum.js';

export const GROUPS = [
  { id: 'neck', label: 'Aprender el mástil' },
  { id: 'practice', label: 'Practicar' },
  { id: 'play', label: 'Tocar y escribir' },
  { id: 'ears', label: 'Oído y afinación' },
  { id: 'ref', label: 'Referencia' },
];

export const TOOLS = [
  navigator, blind, triads, quiz, chords,
  curriculum, routine, repertoire, drills, timing, exlib, exercises, audiolab, recorder, metronome, strum, rhythm, vibrato, log,
  jam, backing, tab, score, licks, randomiser, capo,
  ear, earplay, eq, bendlab, tuner,
  reference,
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
