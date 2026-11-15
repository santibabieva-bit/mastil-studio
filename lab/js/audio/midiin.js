/** Entrada MIDI (Web MIDI): llama a onNote(midi, on, velocity) para cada nota. */

export async function listenMidi({ onNote, onDevices = null }) {
  if (!globalThis.navigator?.requestMIDIAccess) throw new Error('Este navegador no soporta MIDI (prueba con Chrome o Edge).');
  const access = await navigator.requestMIDIAccess();
  const attached = new Set();
  const handler = (event) => {
    const [status, note, velocity] = event.data;
    const kind = status & 0xf0;
    if (kind === 0x90 && velocity > 0) onNote(note, true, velocity);
    else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) onNote(note, false, 0);
  };
  const attach = () => {
    access.inputs.forEach((input) => {
      if (attached.has(input.id)) return;
      input.addEventListener('midimessage', handler);
      attached.add(input.id);
    });
    onDevices?.([...access.inputs.values()].map((i) => i.name));
  };
  attach();
  access.addEventListener('statechange', attach);
  return () => {
    access.removeEventListener('statechange', attach);
    access.inputs.forEach((input) => input.removeEventListener('midimessage', handler));
  };
}
