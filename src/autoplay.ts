// Scripted player for tests and the browser hook: picks hooks by a policy and times strip jumps.
import type { Hook } from './levels.ts';
import { NO_INPUT, Sim, type Input } from './sim.ts';

export type Policy = (choices: Hook[], sim: Sim) => Hook;

/** Best play: the farthest legal hook. */
export const bestPolicy: Policy = (choices) => choices.find((h) => h.perfect) ?? choices.find((h) => h.ok) ?? choices[0];
/** Worst first: try every wrong hook before the right one (exercises every miss path). */
export const wrongFirstPolicy: Policy = (choices) => choices.find((h) => !h.ok) ?? choices.find((h) => h.perfect) ?? choices[0];

export class AutoPlayer {
  /** strip tile to jump from per strip decision id (default: the largest legal tile) */
  stripTiles: Record<string, number> = {};
  constructor(public sim: Sim, public policy: Policy = bestPolicy) {}

  input(): Input {
    const s = this.sim;
    if (s.state === 'decide') {
      const c = s.choices();
      if (c.length) return { ...NO_INPUT, hook: this.policy(c, s).id };
    }
    if (s.state === 'strip' && s.decision?.strip) {
      const want = this.stripTiles[s.decision.id] ?? s.decision.strip.maxN;
      if (s.stripWaiting) return { ...NO_INPUT, tile: want };
    }
    return NO_INPUT;
  }

  run(maxSeconds = 240, dt = 1 / 60): Sim {
    let t = 0;
    while (!this.sim.finished && t < maxSeconds) {
      this.sim.update(dt, this.input());
      t += dt;
    }
    return this.sim;
  }
}
