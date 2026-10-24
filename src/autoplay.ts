// A simple scripted player: runs to the planned marks, fires, then runs to the flag.
// Used by unit tests (solvability, medal times) and by the browser test hook.

import { anchorReachable, anchorHolds, type AnchorDef, type Level } from './levels.ts';
import { NO_INPUT, Sim, type Input } from './sim.ts';

/** Default plan: at every mark group, the farthest anchor that both reaches and holds. */
export function bestPlan(level: Level): string[] {
  const groups = new Map<string, AnchorDef[]>();
  for (const a of level.anchors) {
    const m = level.marks.find((x) => x.id === a.mark)!;
    const key = `${m.top}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const plan: string[] = [];
  const keys = [...groups.keys()].sort((p, q) => Number(q) - Number(p));
  for (const k of keys) {
    const ok = groups.get(k)!.filter((a) => anchorReachable(level, a) && anchorHolds(a));
    ok.sort((p, q) => q.a - p.a);
    if (ok.length) plan.push(ok[0].id);
  }
  return plan;
}

export class AutoPlayer {
  plan: string[];
  step = 0;
  constructor(public sim: Sim, plan?: string[]) {
    this.plan = plan ?? bestPlan(sim.level);
  }

  input(): Input {
    const s = this.sim;
    if (s.state !== 'ground') return NO_INPUT;
    const next = this.plan[this.step];
    if (next) {
      const a = s.level.anchors.find((x) => x.id === next)!;
      const m = s.level.marks.find((x) => x.id === a.mark)!;
      if (Math.abs(m.top - s.p.y) < 0.6) {
        const dx = m.x - s.p.x;
        const dz = m.z - s.p.z;
        const d = Math.hypot(dx, dz);
        const active = s.activeMark();
        if (d < 4 && active?.id === m.id) {
          this.step++;
          return { ...NO_INPUT, fire: true, targetId: next };
        }
        return this.withJump(dx / d, dz / d);
      }
      // the planned mark is on another roof (we fell back or skipped): try the next plan entry
    }
    const f = s.level.finish;
    const dx = f.x - s.p.x;
    const dz = f.z - s.p.z;
    const d = Math.hypot(dx, dz) || 1;
    return this.withJump(dx / d, dz / d);
  }

  /** Jump when the roof ends just ahead (small gaps between neighbouring roofs). */
  private withJump(mx: number, mz: number): Input {
    const s = this.sim;
    const ax = s.p.x + mx * 1.1;
    const az = s.p.z + mz * 1.1;
    const ahead = s.boxAt(ax, az, s.p.y + 0.05);
    const jump = !ahead || ahead.top < s.p.y - 0.3;
    return { ...NO_INPUT, moveX: mx, moveZ: mz, jump };
  }

  /** Run until finished or timeout; returns the sim. */
  run(maxSeconds = 90, dt = 1 / 60): Sim {
    const s = this.sim;
    let t = 0;
    while (!s.finished && t < maxSeconds) {
      const inp = this.input();
      s.update(dt, inp);
      if (inp.fire && s.state === 'ground') this.step--; // fire was refused; retry
      t += dt;
    }
    return s;
  }
}
