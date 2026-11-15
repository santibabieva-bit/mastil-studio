/**
 * Transporte con anticipación («lookahead»): un setInterval corto programa en
 * el reloj de audio los pasos que caen en la ventana siguiente.
 * Si la pestaña está oculta, el navegador frena los temporizadores: ampliamos
 * la ventana para que no haya huecos.
 */

export class Transport {
  /**
   * @param {import('./engine.js').AudioEngine} engine
   * @param {string} tool id de herramienta (registro de práctica)
   */
  constructor(engine, tool = 'misc') {
    this.engine = engine;
    this.tool = tool;
    this.timer = 0;
    this.running = false;
    this.step = 0;
    this.next = 0;
    this.tick = null;
    this.stepSeconds = () => 0.25;
    this.onStop = null;
  }

  /**
   * @param {object} cfg
   * @param {(step:number, time:number) => (boolean|void)} cfg.tick devolver false para parar
   * @param {(step:number) => number} cfg.stepSeconds duración del paso (puede variar)
   * @param {number} [cfg.delay] retardo inicial en segundos
   */
  async start({ tick, stepSeconds, delay = 0.08, startStep = 0 }) {
    this.stop();
    await this.engine.ensure();
    this.tick = tick;
    this.stepSeconds = stepSeconds;
    this.step = startStep;
    this.next = this.engine.time + delay;
    this.running = true;
    this.engine.notePlaying(this.tool, true);
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  pump() {
    if (!this.running) return;
    const horizon = this.engine.time + (typeof document !== 'undefined' && document.hidden ? 1.6 : 0.16);
    let guard = 0;
    while (this.running && this.next < horizon && guard < 64) {
      guard += 1;
      const result = this.tick(this.step, this.next);
      if (result === false) {
        this.stop();
        return;
      }
      this.next += Math.max(0.005, this.stepSeconds(this.step));
      this.step += 1;
    }
  }

  stop() {
    if (!this.running && !this.timer) return;
    clearInterval(this.timer);
    this.timer = 0;
    const was = this.running;
    this.running = false;
    if (was) this.engine.notePlaying(this.tool, false);
    this.engine.clearQueue();
    if (was && this.onStop) this.onStop();
  }
}

/** Reproduce una lista de eventos {time offset, fn} una sola vez. */
export function playTimeline(engine, events, { onDone } = {}) {
  const t0 = engine.time + 0.08;
  let last = 0;
  for (const event of events) {
    event.run(t0 + event.at);
    last = Math.max(last, event.at);
  }
  if (onDone) engine.at(t0 + last + 0.4, onDone);
  return t0;
}
