// v2 deterministic simulation of the one-tap swing runner. Pure TypeScript (no Three.js).
// The runner moves on their own; the only inputs are "tap hook X" and "jump" (on strips).

import { HAND, buildCourse, type Course, type CourseEvent, type Decision, type Hook, type LevelSpec, type Roof, type V3 } from './levels.ts';

export type PState = 'run' | 'leap' | 'decide' | 'rope' | 'swing' | 'pull' | 'fly' | 'miss' | 'bounce' | 'climb' | 'strip' | 'finished';

export interface Input {
  /** tap/click/key on a hook (edge triggered) */
  hook: string | null;
  /** jump on a strip / let go early while swinging (edge triggered) */
  jump: boolean;
}

export const NO_INPUT: Input = { hook: null, jump: false };

export interface Outcome {
  kind: 'hit' | 'miss' | 'collapse';
  decision: string;
  hook: string;
  a: number;
  b: number;
  x?: number;
  z?: number;
  sumSq: number;
  Lsq: number;
  reach: number;
  shortBy: number;
  perfect: boolean;
  frame?: { post: number; beam: number; brace: number };
  /** strip: tile jumped from */
  tile?: number;
  t: number;
}

export interface LogEvent {
  level: string;
  t: number;
  action: string;
  decision?: string;
  hook?: string;
  a?: number;
  b?: number;
  outcome?: string;
  hint?: boolean;
}

export const TUNE = {
  baseSpeed: 7,
  comboSpeed: 0.45,
  maxSpeed: 11,
  stripSpeed: 3.4,
  gravity: 22,
  swingGravity: 24,
  swingKick: 6,
  reelFraction: 0.18,
  reelRate: 0.25,
  releaseBoost: 1.1,
  releaseLift: 4,
  ropeSpeed: 70,
  pullSpeed: 20,
  pullAccel: 50,
  leapTime: 0.34,
  climbSpeed: 9,
  bounceTime: 0.85,
};

const STEP = 1 / 120;

const v = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Sim {
  level: LevelSpec;
  course: Course;
  t = 0;
  timer = 0;
  p: V3 = v();
  vel: V3 = v();
  state: PState = 'run';
  stateT = 0;
  roof: Roof;
  eventIdx = 0;
  decision: Decision | null = null;
  tried = new Set<string>();
  missedHere = false;
  combo = 0;
  bestCombo = 0;
  decided = 0;
  perfects = 0;
  misses = 0;
  hintsUsed = 0;
  finished = false;
  // rope
  hook: Hook | null = null;
  ropeFrom: V3 = v();
  ropeTip: V3 | null = null;
  ropeLen = 0;
  ropeMax = 0;
  ropeR0 = 0;
  ropeRest = 0;
  swingDir = { x: 1, z: 0 };
  phi0 = 0;
  collapseAt = -1;
  brokenHook: string | null = null;
  // scripted motion
  from: V3 = v();
  to: V3 = v();
  arcH = 0;
  dur = 0;
  flyTarget: { kind: 'roof'; roof: Roof } | { kind: 'point'; d: Decision } | null = null;
  flyEnd = 0;
  climbTop = 0;
  stripTile = 0;
  /** strips: the runner leaps off the walkway end while the rope flies */
  stripLeap = false;
  lastOutcome: Outcome | null = null;
  log: LogEvent[] = [];
  events: string[] = [];

  constructor(level: LevelSpec) {
    this.level = level;
    this.course = buildCourse(level);
    this.roof = this.course.roofs[0];
    this.reset();
  }

  reset(): void {
    const c = this.course;
    this.p = { ...c.start };
    this.vel = v(TUNE.baseSpeed, 0, 0);
    this.state = 'run';
    this.stateT = 0;
    this.roof = c.roofs[0];
    this.eventIdx = 0;
    this.decision = null;
    this.tried.clear();
    this.combo = 0;
    this.bestCombo = 0;
    this.decided = 0;
    this.perfects = 0;
    this.misses = 0;
    this.hintsUsed = 0;
    this.finished = false;
    this.t = 0;
    this.timer = 0;
    this.clearRope();
    this.brokenHook = null;
    this.lastOutcome = null;
    this.log = [];
    this.events.push('reset');
  }

  get speed(): number {
    return Math.min(TUNE.maxSpeed, TUNE.baseSpeed + this.combo * TUNE.comboSpeed);
  }

  get nextEvent(): CourseEvent | null {
    return this.course.events[this.eventIdx] ?? null;
  }

  /** Hooks that can be tapped right now. */
  choices(): Hook[] {
    if (this.state !== 'decide' || !this.decision) return [];
    return this.decision.hooks.filter((hk) => !this.tried.has(hk.id));
  }

  hand(): V3 {
    return { x: this.p.x, y: this.p.y + HAND, z: this.p.z };
  }

  clearRope(): void {
    this.hook = null;
    this.ropeTip = null;
    this.collapseAt = -1;
  }

  setState(s: PState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, input: Input): void {
    let hook = input.hook;
    let jump = input.jump;
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(STEP, remaining);
      this.t += h;
      this.stateT += h;
      if (!this.finished && this.state !== 'decide') this.timer += h;
      this.step(h, hook, jump);
      hook = null;
      jump = false;
      remaining -= h;
    }
  }

  private step(dt: number, tapHook: string | null, jump: boolean): void {
    switch (this.state) {
      case 'run':
        return this.stepRun(dt);
      case 'leap':
        return this.stepArc(dt, () => this.enterDecide(this.decision!));
      case 'decide':
        return this.stepDecide(tapHook);
      case 'rope':
        return this.stepRope(dt);
      case 'swing':
        return this.stepSwing(dt, jump || tapHook !== null);
      case 'pull':
        return this.stepPull(dt);
      case 'fly':
        return this.stepFly(dt);
      case 'miss':
        return this.stepMiss(dt);
      case 'bounce':
        return this.stepArc(dt, () => this.afterBounce());
      case 'climb':
        return this.stepClimb(dt);
      case 'strip':
        return this.stepStrip(dt, jump || tapHook !== null);
      case 'finished':
        this.vel = v();
        return;
    }
  }

  // ---------- running ----------

  private stepRun(dt: number): void {
    const ev = this.nextEvent;
    const sp = this.speed;
    this.vel = v(sp, 0, 0);
    this.p.x += sp * dt;
    this.p.y = this.roof.top;
    if (!ev) return;
    this.p.z = lerp(this.p.z, ev.z, Math.min(1, dt * 3));
    if (ev.type === 'finish' && this.p.x >= ev.x) {
      this.finished = true;
      this.setState('finished');
      this.events.push('finish');
      this.log.push({ level: this.level.id, t: this.t, action: 'finish', outcome: `misses=${this.misses} perfect=${this.perfects}/${this.decided}` });
      return;
    }
    if (ev.type === 'climb' && this.p.x >= ev.x - 0.35) {
      this.p.x = ev.x - 0.35;
      this.climbTop = ev.top!;
      this.setState('climb');
      this.events.push('climb');
      return;
    }
    if (ev.type === 'decision') {
      const d = ev.decision!;
      if (d.kind === 'strip' && this.p.x >= d.edge!) {
        this.decision = d;
        this.tried.clear();
        this.missedHere = false;
        this.p.z = d.P.z;
        this.setState('strip');
        this.events.push('strip');
        return;
      }
      if (d.kind === 'hooks' && this.p.x >= d.edge! - 0.15) {
        this.decision = d;
        this.tried.clear();
        this.missedHere = false;
        this.arcTo({ x: d.P.x, y: d.P.y - HAND, z: d.P.z }, TUNE.leapTime, 0.6);
        this.setState('leap');
        this.events.push('jump');
      }
    }
  }

  private arcTo(target: V3, dur: number, h: number): void {
    this.from = { ...this.p };
    this.to = { ...target };
    this.dur = dur;
    this.arcH = h;
  }

  private stepArc(dt: number, done: () => void): void {
    const k = clamp(this.stateT / this.dur, 0, 1);
    const prev = { ...this.p };
    this.p = {
      x: lerp(this.from.x, this.to.x, k),
      y: lerp(this.from.y, this.to.y, k) + Math.sin(k * Math.PI) * this.arcH,
      z: lerp(this.from.z, this.to.z, k),
    };
    if (dt > 0) this.vel = scale(sub(this.p, prev), 1 / dt);
    if (k >= 1) done();
  }

  // ---------- bullet-time decision ----------

  private enterDecide(d: Decision): void {
    this.decision = d;
    this.p = { x: d.P.x, y: d.P.y - HAND, z: d.P.z };
    this.vel = v(0.4, 0, 0);
    this.setState('decide');
    this.events.push('decide');
  }

  private stepDecide(tapHook: string | null): void {
    // the world nearly stops: a tiny hover so it reads as frozen mid-leap
    const d = this.decision!;
    this.p.y = d.P.y - HAND + Math.sin(this.t * 2.5) * 0.03;
    if (!tapHook) return;
    const hk = d.hooks.find((x) => x.id === tapHook);
    if (!hk || this.tried.has(hk.id)) return;
    this.p.y = d.P.y - HAND;
    this.fire(d, hk, this.hand());
  }

  private fire(d: Decision, hk: Hook, from: V3, tile?: number): void {
    const L = this.level.L;
    let reachSq = hk.reachSq;
    let ok = hk.ok;
    let perfect = hk.perfect;
    let a = Math.sqrt(hk.h2);
    if (d.kind === 'strip' && tile !== undefined) {
      a = tile;
      reachSq = tile * tile + hk.v2;
      ok = reachSq <= L * L;
      perfect = tile === d.strip!.maxN;
    }
    const reaches = reachSq <= L * L;
    this.hook = hk;
    this.ropeFrom = { ...from };
    const reach = Math.sqrt(reachSq);
    this.ropeMax = reaches ? len(sub(hk.pos, from)) : L;
    this.ropeLen = 0;
    this.ropeTip = { ...from };
    const hd = Math.hypot(hk.pos.x - from.x, hk.pos.z - from.z) || 1;
    this.swingDir = { x: (hk.pos.x - from.x) / hd, z: (hk.pos.z - from.z) / hd };
    this.lastOutcome = {
      kind: !reaches ? 'miss' : ok ? 'hit' : 'collapse',
      decision: d.id,
      hook: hk.id,
      a,
      b: hk.spec.b,
      x: hk.spec.z !== undefined ? hk.spec.a : undefined,
      z: hk.spec.z,
      sumSq: reachSq,
      Lsq: L * L,
      reach,
      shortBy: reaches ? 0 : reach - L,
      perfect,
      frame: hk.spec.frame,
      tile,
      t: this.t,
    };
    this.log.push({ level: this.level.id, t: this.t, action: 'fire', decision: d.id, hook: hk.id, a, b: hk.spec.b, outcome: !reaches ? 'short' : ok ? 'reach' : 'breaks' });
    this.stripLeap = d.kind === 'strip';
    if (this.stripLeap) this.arcTo({ x: d.strip!.foot - 0.1, y: d.strip!.top + 0.9, z: d.P.z }, 0.32, 0.5);
    this.setState('rope');
    this.events.push('fire');
  }

  private stepRope(dt: number): void {
    const hk = this.hook!;
    this.ropeLen = Math.min(this.ropeMax, this.ropeLen + TUNE.ropeSpeed * dt);
    const dir = norm(sub(hk.pos, this.ropeFrom));
    this.ropeTip = { x: this.ropeFrom.x + dir.x * this.ropeLen, y: this.ropeFrom.y + dir.y * this.ropeLen, z: this.ropeFrom.z + dir.z * this.ropeLen };
    let leaping = false;
    if (this.stripLeap) {
      const k = clamp(this.stateT / this.dur, 0, 1);
      this.p = { x: lerp(this.from.x, this.to.x, k), y: lerp(this.from.y, this.to.y, k) + Math.sin(k * Math.PI) * this.arcH, z: this.to.z };
      leaping = k < 1;
    }
    if (this.ropeLen < this.ropeMax - 1e-9 || leaping) return;
    this.stripLeap = false;
    const o = this.lastOutcome!;
    if (o.kind === 'miss') return this.startMiss();
    this.events.push('attach');
    this.registerHit();
    if (hk.kind === 'pull') {
      this.vel = scale(dir, 6);
      this.setState('pull');
      return;
    }
    const hnd = this.hand();
    this.ropeR0 = len(sub(hnd, hk.pos));
    this.ropeRest = this.ropeR0;
    const u = norm(sub(hk.pos, hnd));
    const f = v(this.swingDir.x, 0, this.swingDir.z);
    const tan = norm(sub(f, scale(u, dot(f, u))));
    this.vel = scale(tan, TUNE.swingKick);
    this.phi0 = Math.atan2(Math.hypot(hk.pos.x - hnd.x, hk.pos.z - hnd.z), hk.pos.y - hnd.y);
    this.collapseAt = o.kind === 'collapse' ? 0.42 : -1;
    this.setState('swing');
  }

  private registerHit(): void {
    const o = this.lastOutcome!;
    if (o.kind !== 'hit') return;
    this.decided++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (o.perfect && !this.missedHere) {
      this.perfects++;
      this.events.push('perfect');
    }
    this.events.push('combo');
  }

  // ---------- swinging ----------

  private stepSwing(dt: number, releasePressed: boolean): void {
    const A = this.hook!.pos;
    const hnd = this.hand();
    this.vel.y -= TUNE.swingGravity * dt;
    hnd.x += this.vel.x * dt;
    hnd.y += this.vel.y * dt;
    hnd.z += this.vel.z * dt;
    const minLen = this.ropeR0 * (1 - TUNE.reelFraction);
    if (this.ropeRest > minLen) {
      const old = this.ropeRest;
      this.ropeRest = Math.max(minLen, old - TUNE.reelRate * this.ropeR0 * dt);
      const d = norm(sub(hnd, A));
      const vr = dot(this.vel, d);
      const vt = sub(this.vel, scale(d, vr));
      const k = old / this.ropeRest;
      this.vel = { x: vt.x * k + d.x * vr, y: vt.y * k + d.y * vr, z: vt.z * k + d.z * vr };
    }
    const d = sub(hnd, A);
    const l = len(d);
    if (l > this.ropeRest) {
      const n = scale(d, 1 / l);
      hnd.x = A.x + n.x * this.ropeRest;
      hnd.y = A.y + n.y * this.ropeRest;
      hnd.z = A.z + n.z * this.ropeRest;
      const vr = dot(this.vel, n);
      if (vr > 0) this.vel = sub(this.vel, scale(n, vr));
    }
    this.p = { x: hnd.x, y: hnd.y - HAND, z: hnd.z };
    this.ropeTip = { ...A };
    if (this.collapseAt >= 0 && this.stateT >= this.collapseAt) {
      this.brokenHook = this.hook!.id;
      this.events.push('collapse');
      this.startMiss();
      return;
    }
    const s = (hnd.x - A.x) * this.swingDir.x + (hnd.z - A.z) * this.swingDir.z;
    const phi = Math.atan2(s, A.y - hnd.y);
    const relPhi = clamp(this.phi0 * 0.7, 0.26, 0.85);
    const auto = s > 0 && (phi >= relPhi || this.vel.y < -0.3 || this.stateT > 4);
    const early = releasePressed && s > 0 && this.collapseAt < 0;
    if (auto || early) {
      this.vel.x *= TUNE.releaseBoost;
      this.vel.z *= TUNE.releaseBoost;
      this.vel.y = Math.max(this.vel.y, 0) + TUNE.releaseLift;
      this.events.push(early ? 'flip' : 'release');
      this.flyNext();
    }
  }

  private stepPull(dt: number): void {
    const A = this.hook!.pos;
    const hnd = this.hand();
    const to = sub(A, hnd);
    const d = len(to);
    const speed = Math.min(TUNE.pullSpeed, len(this.vel) + TUNE.pullAccel * dt);
    this.ropeTip = { ...A };
    if (d <= speed * dt + 0.35) {
      this.p = { x: A.x, y: A.y - HAND, z: A.z };
      this.vel = v(this.swingDir.x * 5, 6, this.swingDir.z * 5);
      this.events.push('pull_arrive');
      this.flyNext();
      return;
    }
    const n = scale(to, 1 / d);
    this.vel = scale(n, speed);
    this.p.x += n.x * speed * dt;
    this.p.y += n.y * speed * dt;
    this.p.z += n.z * speed * dt;
  }

  /** After a legal line: fly to the next chain point, or land on the decision's roof. */
  private flyNext(): void {
    const d = this.decision!;
    this.clearRope();
    const g = TUNE.gravity;
    if (d.next) {
      const P = d.next.P;
      const target = { x: P.x, y: P.y - HAND, z: P.z };
      let vy: number;
      let t: number;
      if (target.y > this.p.y + 0.2) {
        vy = Math.sqrt(2 * g * (target.y - this.p.y));
        t = vy / g;
      } else {
        vy = Math.max(this.vel.y, 3);
        const dy = this.p.y - target.y;
        t = (vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
      }
      this.vel = { x: (target.x - this.p.x) / t, y: vy, z: (target.z - this.p.z) / t };
      this.flyTarget = { kind: 'point', d: d.next };
      this.flyEnd = t;
    } else {
      const r = d.land;
      if (this.p.y < r.top + 0.4) this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * g * (r.top + 1.4 - this.p.y)));
      const dy = this.p.y - r.top;
      const t = (this.vel.y + Math.sqrt(this.vel.y * this.vel.y + 2 * g * dy)) / g;
      const nx = this.p.x + this.vel.x * t;
      const nz = this.p.z + this.vel.z * t;
      const tx = clamp(nx, r.x0 + 1.6, Math.min(r.x1 - 4, r.x0 + 30));
      const zMid = (r.z0 + r.z1) / 2;
      const tz = clamp(nz, Math.max(r.z0 + 1.5, zMid - 4), Math.min(r.z1 - 1.5, zMid + 4));
      this.vel.x = (tx - this.p.x) / t;
      this.vel.z = (tz - this.p.z) / t;
      this.flyTarget = { kind: 'roof', roof: r };
      this.flyEnd = t;
    }
    this.setState('fly');
  }

  private stepFly(dt: number): void {
    this.vel.y -= TUNE.gravity * dt;
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    this.p.z += this.vel.z * dt;
    const tgt = this.flyTarget!;
    if (tgt.kind === 'point') {
      if (this.stateT >= this.flyEnd) {
        this.tried.clear();
        this.missedHere = false;
        this.enterDecide(tgt.d);
      }
      return;
    }
    const r = tgt.roof;
    if (this.vel.y <= 0 && this.p.y <= r.top && this.p.x >= r.x0 - 0.3) {
      const hard = -this.vel.y > 12;
      this.p.y = r.top;
      this.roof = r;
      this.decision = null;
      this.flyTarget = null;
      this.eventIdx++;
      this.setState('run');
      this.events.push(hard ? 'land_hard' : 'land');
    }
  }

  // ---------- missing ----------

  private startMiss(): void {
    const d = this.decision!;
    const o = this.lastOutcome!;
    this.misses++;
    this.combo = 0;
    this.missedHere = true;
    if (d.kind === 'hooks') this.tried.add(this.hook!.id);
    if (o.kind === 'miss') this.events.push('short');
    this.log.push({ level: this.level.id, t: this.t, action: o.kind, decision: d.id, hook: this.hook?.id, outcome: 'canopy' });
    const c = d.canopy;
    const g = TUNE.gravity;
    const vy = o.kind === 'miss' ? 3 : Math.max(this.vel.y, 0) + 1;
    const dy = Math.max(this.p.y - c.top, 0.2);
    const t = (vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
    const tx = clamp(this.p.x, c.x0 + 0.8, c.x1 - 0.8);
    this.vel = { x: (tx - this.p.x) / t, y: vy, z: (c.z - this.p.z) / t };
    this.setState('miss');
  }

  private stepMiss(dt: number): void {
    const prevY = this.p.y;
    this.vel.y -= TUNE.gravity * dt;
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    this.p.z += this.vel.z * dt;
    if (this.ropeTip) {
      const back = sub(this.hand(), this.ropeTip);
      const bl = len(back);
      if (bl < 1 || this.stateT > 0.5) this.ropeTip = null;
      else {
        const k = Math.min(1, (TUNE.ropeSpeed * 0.5 * dt) / bl);
        this.ropeTip = { x: this.ropeTip.x + back.x * k, y: this.ropeTip.y + back.y * k - 3 * dt, z: this.ropeTip.z + back.z * k };
      }
    }
    const d = this.decision!;
    const c = d.canopy;
    if (prevY >= c.top && this.p.y <= c.top) {
      this.p.y = c.top;
      this.ropeTip = null;
      this.hook = null;
      this.events.push('canopy');
      // trampoline back up to where the choice was made
      if (d.kind === 'strip') {
        const s = d.strip!;
        this.arcTo({ x: s.foot - 9.5, y: s.top, z: d.P.z }, TUNE.bounceTime, 4.5);
      } else {
        this.arcTo({ x: d.P.x, y: d.P.y - HAND, z: d.P.z }, TUNE.bounceTime, 3.2);
      }
      this.setState('bounce');
    }
  }

  private afterBounce(): void {
    const d = this.decision!;
    this.brokenHook = null;
    if (d.kind === 'strip') {
      this.setState('strip');
      return;
    }
    this.enterDecide(d);
  }

  // ---------- climbing ----------

  private stepClimb(dt: number): void {
    this.vel = v(0, TUNE.climbSpeed, 0);
    this.p.y += TUNE.climbSpeed * dt;
    if (this.p.y >= this.climbTop) {
      this.p.y = this.climbTop;
      this.p.x += 0.6;
      this.roof = this.course.roofs.find((r) => r.top === this.climbTop && this.p.x >= r.x0 - 0.5 && this.p.x <= r.x1) ?? this.roof;
      this.eventIdx++;
      this.setState('run');
      this.events.push('climbed');
    }
  }

  // ---------- jump strip ----------

  private stepStrip(dt: number, jump: boolean): void {
    const d = this.decision!;
    const s = d.strip!;
    this.vel = v(TUNE.stripSpeed, 0, 0);
    this.p.x += TUNE.stripSpeed * dt;
    this.p.y = s.top;
    const n = clamp(Math.round(s.foot - this.p.x), 1, 10);
    this.stripTile = n;
    if (jump || this.p.x >= s.foot - 1) {
      const tile = jump ? n : 1;
      this.p.x = s.foot - tile;
      this.fire(d, d.hooks[0], this.hand(), tile);
      this.events.push('jump');
    }
  }

  // ---------- reporting ----------

  stars(): number {
    if (this.misses === 0 && this.perfects === this.decided) return 3;
    if (this.misses === 0) return 2;
    return 1;
  }
}
