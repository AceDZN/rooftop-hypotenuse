// Deterministic game simulation. Pure TypeScript (no Three.js): the scene renders this state,
// tests drive it directly. Positions are metres; `p` is the player's feet.

import {
  HAND_HEIGHT,
  anchorHolds,
  anchorOffset,
  anchorReachSq,
  anchorReachable,
  anchorWorld,
  anchorsOfMark,
  boxById,
  handOf,
  legsSq,
  markById,
  type AnchorDef,
  type Awning,
  type Box,
  type Level,
  type Mark,
} from './levels.ts';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type PState =
  | 'ground'
  | 'air'
  | 'dash'
  | 'rope'
  | 'swing'
  | 'pull'
  | 'miss'
  | 'bounce'
  | 'climb'
  | 'respawn'
  | 'finished';

export interface Input {
  /** desired horizontal move direction in world space, length 0..1 */
  moveX: number;
  moveZ: number;
  jump: boolean;
  /** fire (or release while swinging) — edge triggered */
  fire: boolean;
  focus: boolean;
  targetId: string | null;
}

export const NO_INPUT: Input = { moveX: 0, moveZ: 0, jump: false, fire: false, focus: false, targetId: null };

export interface Outcome {
  kind: 'hit' | 'miss' | 'collapse' | 'fall';
  anchorId: string | null;
  markId: string | null;
  a: number;
  b: number;
  x?: number;
  z?: number;
  sumSq: number;
  Lsq: number;
  reach: number;
  shortBy: number;
  t: number;
}

export interface LogEvent {
  level: string;
  t: number;
  action: string;
  anchor?: string;
  mark?: string;
  a?: number;
  b?: number;
  outcome?: string;
  hint?: boolean;
  retries?: number;
}

export const TUNE = {
  runSpeed: 7.6,
  groundAccel: 46,
  airAccel: 14,
  gravity: 22,
  jumpV: 8,
  swingGravity: 21,
  swingKick: 5.5,
  reelFraction: 0.2,
  reelRate: 0.22,
  releaseBoost: 1.12,
  releaseLift: 4,
  ropeSpeed: 85,
  pullSpeed: 21,
  pullAccel: 46,
  dashSpeed: 22,
  dashRange: 7,
  focusScale: 0.15,
  focusDrain: 0.4,
  focusRefill: 0.22,
  bodyR: 0.32,
  climbTime: 1.15,
  respawnTime: 0.75,
};

const STEP = 1 / 120;

function v(x = 0, y = 0, z = 0): V3 {
  return { x, y, z };
}
function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function len(a: V3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function scale(a: V3, s: number): V3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function norm(a: V3): V3 {
  const l = len(a) || 1;
  return scale(a, 1 / l);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class Sim {
  level: Level;
  t = 0;
  /** medal timer (starts on first input) */
  timer = 0;
  timerRunning = false;
  p: V3 = v();
  vel: V3 = v();
  yaw = 0;
  state: PState = 'ground';
  stateT = 0;
  groundBox: Box | null = null;
  focus = 1;
  focusing = false;
  falls = 0;
  hintsUsed = 0;
  checkpoint: V3 = v();
  checkpointYaw = 0;

  // grapple
  anchor: AnchorDef | null = null;
  anchorPos: V3 | null = null;
  firedMark: Mark | null = null;
  ropeTip: V3 | null = null;
  ropeLen = 0;
  ropeMax = 0;
  ropeOk = false;
  ropeRestLen = 0;
  ropeR0 = 0;
  swingDir = { x: 1, z: 0 };
  swingPhi0 = 0;
  collapseAt = -1;
  /** bracket that broke, for the scene */
  brokenAnchor: string | null = null;
  assistTarget: V3 | null = null;
  assistBox: string | null = null;
  awning: Awning | null = null;
  bounces = 0;
  climbFrom: V3 = v();
  climbTo: V3 = v();
  climbMid: V3 = v();
  dashTarget: Mark | null = null;
  dashAnchor: string | null = null;

  lastOutcome: Outcome | null = null;
  usedMarks: string[] = [];
  chosenAnchors: string[] = [];
  log: LogEvent[] = [];
  /** one-shot events for the scene/audio: cleared by the consumer */
  events: string[] = [];
  finished = false;

  constructor(level: Level) {
    this.level = level;
    this.reset();
  }

  reset(): void {
    const l = this.level;
    const sb = this.boxAt(l.start.x, l.start.z, 1e9);
    this.p = v(l.start.x, sb ? sb.top : 0, l.start.z);
    this.vel = v();
    this.yaw = l.start.yaw;
    this.state = 'ground';
    this.stateT = 0;
    this.groundBox = sb;
    this.t = 0;
    this.timer = 0;
    this.timerRunning = false;
    this.focus = 1;
    this.falls = 0;
    this.hintsUsed = 0;
    this.checkpoint = { ...this.p };
    this.checkpointYaw = this.yaw;
    this.clearRope();
    this.lastOutcome = null;
    this.usedMarks = [];
    this.chosenAnchors = [];
    this.finished = false;
    this.brokenAnchor = null;
    this.events.push('reset');
  }

  clearRope(): void {
    this.anchor = null;
    this.anchorPos = null;
    this.ropeTip = null;
    this.ropeOk = false;
    this.collapseAt = -1;
    this.assistTarget = null;
    this.assistBox = null;
  }

  hand(): V3 {
    return { x: this.p.x, y: this.p.y + HAND_HEIGHT, z: this.p.z };
  }

  // ---------- queries ----------

  boxAt(x: number, z: number, maxTop: number, pad = 0): Box | null {
    let best: Box | null = null;
    for (const b of this.level.boxes) {
      if (x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad && b.top <= maxTop + 1e-6) {
        if (!best || b.top > best.top) best = b;
      }
    }
    return best;
  }

  /** The take-off mark the scan measures from: nearest mark on the surface the player stands on. */
  activeMark(): Mark | null {
    if (this.state !== 'ground' && this.state !== 'dash') return null;
    let best: Mark | null = null;
    let bestD = Infinity;
    for (const m of this.level.marks) {
      if (Math.abs(m.top - this.p.y) > 0.6) continue;
      const d = Math.hypot(m.x - this.p.x, m.z - this.p.z);
      if (d < bestD && d < 30) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  markDistance(m: Mark): number {
    return Math.hypot(m.x - this.p.x, m.z - this.p.z);
  }

  candidates(): AnchorDef[] {
    const m = this.activeMark();
    return m ? anchorsOfMark(this.level, m.id) : [];
  }

  // ---------- main update ----------

  /** Advance by real seconds. Focus slows simulated time. */
  update(realDt: number, input: Input): void {
    const wantsFocus = input.focus && this.focus > 0.02 && !this.finished;
    this.focusing = wantsFocus;
    if (wantsFocus) this.focus = Math.max(0, this.focus - TUNE.focusDrain * realDt);
    else this.focus = Math.min(1, this.focus + TUNE.focusRefill * realDt);
    const dt = realDt * (wantsFocus ? TUNE.focusScale : 1);

    if (!this.timerRunning && !this.finished && (input.moveX || input.moveZ || input.jump || input.fire)) {
      this.timerRunning = true;
      this.log.push({ level: this.level.id, t: this.t, action: 'start' });
    }

    // edge-triggered actions are consumed on the first substep only
    let fire = input.fire;
    let jump = input.jump;
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(STEP, remaining);
      this.step(h, input, fire, jump);
      fire = false;
      jump = false;
      remaining -= h;
    }
  }

  private step(dt: number, input: Input, fire: boolean, jump: boolean): void {
    this.t += dt;
    this.stateT += dt;
    if (this.timerRunning && !this.finished) this.timer += dt;

    switch (this.state) {
      case 'ground':
      case 'air':
        this.stepMove(dt, input, fire, jump);
        break;
      case 'dash':
        this.stepDash(dt);
        break;
      case 'rope':
        this.stepRope(dt);
        break;
      case 'swing':
        this.stepSwing(dt, fire || jump);
        break;
      case 'pull':
        this.stepPull(dt);
        break;
      case 'miss':
        this.stepMiss(dt);
        break;
      case 'bounce':
        this.stepBounce(dt);
        break;
      case 'climb':
        this.stepClimb();
        break;
      case 'respawn':
        if (this.stateT >= TUNE.respawnTime) {
          this.p = { ...this.checkpoint };
          this.vel = v();
          this.yaw = this.checkpointYaw;
          this.setState('ground');
          this.events.push('respawned');
        }
        break;
      case 'finished':
        this.vel = v();
        break;
    }
  }

  private setState(s: PState): void {
    this.state = s;
    this.stateT = 0;
  }

  // ---------- running and jumping ----------

  private stepMove(dt: number, input: Input, fire: boolean, jump: boolean): void {
    const grounded = this.state === 'ground';
    const mx = input.moveX;
    const mz = input.moveZ;
    const ml = Math.hypot(mx, mz);
    if (!this.assistTarget) {
      const tx = (ml > 1 ? mx / ml : mx) * TUNE.runSpeed;
      const tz = (ml > 1 ? mz / ml : mz) * TUNE.runSpeed;
      const acc = (grounded ? TUNE.groundAccel : TUNE.airAccel) * dt;
      // in the air, letting go of the stick keeps your momentum
      if (grounded || ml > 0.1) {
        this.vel.x += clamp(tx - this.vel.x, -acc, acc);
        this.vel.z += clamp(tz - this.vel.z, -acc, acc);
      }
      if (ml > 0.1) this.yaw = turnToward(this.yaw, Math.atan2(mz, mx), dt * 14);
    } else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) {
      this.yaw = turnToward(this.yaw, Math.atan2(this.vel.z, this.vel.x), dt * 8);
    }

    if (grounded && fire) {
      if (this.tryFire(input.targetId)) return;
    }
    if (grounded && jump) {
      this.vel.y = TUNE.jumpV;
      this.setState('air');
      this.groundBox = null;
      this.events.push('jump');
    }

    const prevY = this.p.y;
    this.vel.y -= TUNE.gravity * dt;
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    this.p.z += this.vel.z * dt;
    this.collide(prevY);
    this.checkFinish();
    this.checkDeepFall();
  }

  /** Feet vs. box tops and walls. */
  private collide(prevY: number): void {
    const r = TUNE.bodyR;
    let landed: Box | null = null;
    for (const b of this.level.boxes) {
      const inside = this.p.x >= b.x0 && this.p.x <= b.x1 && this.p.z >= b.z0 && this.p.z <= b.z1;
      if (inside && this.vel.y <= 0 && prevY >= b.top - 0.02 && this.p.y <= b.top) {
        if (!landed || b.top > landed.top) landed = b;
      }
    }
    if (landed) {
      const wasAir = this.state === 'air';
      const fallSpeed = -this.vel.y;
      this.p.y = landed.top;
      this.vel.y = 0;
      this.groundBox = landed;
      if (wasAir) {
        this.setState('ground');
        this.events.push(fallSpeed > 11 ? 'land_hard' : 'land');
        if (this.assistTarget) {
          this.assistTarget = null;
          this.assistBox = null;
          this.checkpoint = { ...this.p };
          this.checkpointYaw = this.yaw;
          this.events.push('landed_line');
        }
      }
    } else if (this.state === 'ground') {
      // walked off an edge?
      const under = this.boxAt(this.p.x, this.p.z, this.p.y + 0.05);
      if (!under || under.top < this.p.y - 0.05) {
        this.setState('air');
        this.groundBox = null;
      }
    }
    // walls: push out of any box whose top is above the feet
    for (const b of this.level.boxes) {
      if (this.p.y >= b.top - 0.05 || this.p.y < b.y0 - 1.8) continue;
      const ix0 = b.x0 - r;
      const ix1 = b.x1 + r;
      const iz0 = b.z0 - r;
      const iz1 = b.z1 + r;
      if (this.p.x > ix0 && this.p.x < ix1 && this.p.z > iz0 && this.p.z < iz1) {
        const dx0 = this.p.x - ix0;
        const dx1 = ix1 - this.p.x;
        const dz0 = this.p.z - iz0;
        const dz1 = iz1 - this.p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) {
          this.p.x = ix0;
          this.vel.x = Math.min(this.vel.x, 0);
        } else if (m === dx1) {
          this.p.x = ix1;
          this.vel.x = Math.max(this.vel.x, 0);
        } else if (m === dz0) {
          this.p.z = iz0;
          this.vel.z = Math.min(this.vel.z, 0);
        } else {
          this.p.z = iz1;
          this.vel.z = Math.max(this.vel.z, 0);
        }
      }
    }
    // awnings catch anyone falling past them
    if (this.vel.y < 0) {
      for (const w of this.level.awnings) {
        if (prevY >= w.top && this.p.y <= w.top && insideAwning(w, this.p.x, this.p.z)) {
          this.awning = w;
          this.p.y = w.top;
          this.startBounce();
          return;
        }
      }
    }
  }

  private checkFinish(): void {
    const f = this.level.finish;
    if (this.state === 'ground' && !this.finished && Math.hypot(this.p.x - f.x, this.p.z - f.z) < 2.2) {
      this.finished = true;
      this.timerRunning = false;
      this.setState('finished');
      this.events.push('finish');
      this.log.push({ level: this.level.id, t: this.t, action: 'finish', outcome: `${this.timer.toFixed(2)}s falls=${this.falls}` });
    }
  }

  private checkDeepFall(): void {
    let minTop = Infinity;
    for (const b of this.level.boxes) minTop = Math.min(minTop, b.top);
    if (this.p.y < Math.min(minTop - 7, 3) && this.state === 'air') {
      this.falls++;
      this.setState('respawn');
      this.vel = v();
      this.assistTarget = null;
      this.events.push('fall_respawn');
      this.lastOutcome = { kind: 'fall', anchorId: null, markId: null, a: 0, b: 0, sumSq: 0, Lsq: 0, reach: 0, shortBy: 0, t: this.t };
      this.log.push({ level: this.level.id, t: this.t, action: 'fell_off', outcome: 'respawn' });
    }
  }

  // ---------- firing ----------

  /** Returns true when the fire input was consumed (dash or launch). */
  tryFire(targetId: string | null): boolean {
    const m = this.activeMark();
    if (!m) {
      this.events.push('no_mark');
      return false;
    }
    const cands = anchorsOfMark(this.level, m.id);
    const target = cands.find((a) => a.id === targetId) ?? null;
    if (!target) {
      this.events.push('no_target');
      return false;
    }
    const d = this.markDistance(m);
    if (d > m.snap) {
      if (d > TUNE.dashRange) {
        this.events.push('too_far');
        return false;
      }
      this.dashTarget = m;
      this.dashAnchor = target.id;
      this.setState('dash');
      this.events.push('dash');
      return true;
    }
    this.launch(m, target);
    return true;
  }

  private stepDash(dt: number): void {
    const m = this.dashTarget!;
    const dx = m.x - this.p.x;
    const dz = m.z - this.p.z;
    const d = Math.hypot(dx, dz);
    const step = TUNE.dashSpeed * dt;
    this.yaw = Math.atan2(dz, dx);
    if (d <= step) {
      this.p.x = m.x;
      this.p.z = m.z;
      const a = this.level.anchors.find((x) => x.id === this.dashAnchor)!;
      this.launch(m, a);
    } else {
      this.p.x += (dx / d) * step;
      this.p.z += (dz / d) * step;
      this.vel = v((dx / d) * TUNE.dashSpeed, 0, (dz / d) * TUNE.dashSpeed);
    }
  }

  /** Commit to a line from mark `m` toward anchor `a`. The rule is decided here, from the mark. */
  launch(m: Mark, a: AnchorDef): void {
    this.p = { x: m.x, y: m.top, z: m.z };
    const hand = handOf(m);
    const A = anchorWorld(this.level, a);
    const sumSq = anchorReachSq(a);
    const L = this.level.L;
    const ok = anchorReachable(this.level, a);
    const reach = Math.sqrt(sumSq);
    const { h2 } = legsSq(a);
    this.anchor = a;
    this.anchorPos = A;
    this.firedMark = m;
    this.ropeOk = ok;
    this.ropeMax = ok ? reach : L;
    this.ropeLen = 0;
    this.ropeTip = { ...hand };
    const o = anchorOffset(a);
    const hl = Math.hypot(o.x, o.z) || 1;
    this.swingDir = { x: o.x / hl, z: o.z / hl };
    this.yaw = Math.atan2(this.swingDir.z, this.swingDir.x);
    this.vel = v();
    this.setState('rope');
    this.usedMarks.push(m.id);
    this.chosenAnchors.push(a.id);
    this.lastOutcome = {
      kind: ok ? 'hit' : 'miss',
      anchorId: a.id,
      markId: m.id,
      a: Math.sqrt(h2),
      b: a.b,
      x: a.xz?.x,
      z: a.xz?.z,
      sumSq,
      Lsq: L * L,
      reach,
      shortBy: ok ? 0 : reach - L,
      t: this.t,
    };
    this.log.push({ level: this.level.id, t: this.t, action: 'fire', anchor: a.id, mark: m.id, a: Math.sqrt(h2), b: a.b, outcome: ok ? 'reach' : 'short' });
    this.events.push('fire');
  }

  private stepRope(dt: number): void {
    const a = this.anchor!;
    const m = this.firedMark!;
    const hand = handOf(m);
    const A = this.anchorPos!;
    this.ropeLen = Math.min(this.ropeMax, this.ropeLen + TUNE.ropeSpeed * dt);
    const dir = norm(sub(A, hand));
    this.ropeTip = { x: hand.x + dir.x * this.ropeLen, y: hand.y + dir.y * this.ropeLen, z: hand.z + dir.z * this.ropeLen };
    // crouch-and-spring anticipation on the plank
    this.p = { x: m.x, y: m.top, z: m.z };
    if (this.ropeLen < this.ropeMax - 1e-9) return;

    if (!this.ropeOk) {
      this.startMiss('miss');
      return;
    }
    this.events.push('attach');
    if (a.kind === 'pull') {
      this.setState('pull');
      this.vel = scale(dir, 6);
      return;
    }
    // swing (brackets swing too until a crooked one gives way)
    const h = this.hand();
    this.ropeR0 = len(sub(h, A));
    this.ropeRestLen = this.ropeR0;
    const u = norm(sub(A, h));
    const f = v(this.swingDir.x, 0, this.swingDir.z);
    const tan = norm(sub(f, scale(u, dot(f, u))));
    this.vel = scale(tan, TUNE.swingKick);
    this.swingPhi0 = Math.atan2(Math.hypot(A.x - h.x, A.z - h.z), A.y - h.y);
    this.collapseAt = anchorHolds(a) ? -1 : 0.42;
    this.setState('swing');
  }

  // ---------- swinging ----------

  private stepSwing(dt: number, releasePressed: boolean): void {
    const A = this.anchorPos!;
    const h = this.hand();
    this.vel.y -= TUNE.swingGravity * dt;
    h.x += this.vel.x * dt;
    h.y += this.vel.y * dt;
    h.z += this.vel.z * dt;

    // reel in a little: shorter rope, faster swing (angular momentum is kept)
    const minLen = this.ropeR0 * (1 - TUNE.reelFraction);
    if (this.ropeRestLen > minLen) {
      const old = this.ropeRestLen;
      this.ropeRestLen = Math.max(minLen, old - TUNE.reelRate * this.ropeR0 * dt);
      const d = norm(sub(h, A));
      const vr = dot(this.vel, d);
      const vt = sub(this.vel, scale(d, vr));
      this.vel = { x: vt.x * (old / this.ropeRestLen) + d.x * vr, y: vt.y * (old / this.ropeRestLen) + d.y * vr, z: vt.z * (old / this.ropeRestLen) + d.z * vr };
    }

    // inextensible rope: project back onto the sphere and drop outward radial speed
    const d = sub(h, A);
    const l = len(d);
    if (l > this.ropeRestLen) {
      const n = scale(d, 1 / l);
      h.x = A.x + n.x * this.ropeRestLen;
      h.y = A.y + n.y * this.ropeRestLen;
      h.z = A.z + n.z * this.ropeRestLen;
      const vr = dot(this.vel, n);
      if (vr > 0) this.vel = sub(this.vel, scale(n, vr));
    }
    this.p = { x: h.x, y: h.y - HAND_HEIGHT, z: h.z };
    this.yaw = Math.atan2(this.swingDir.z, this.swingDir.x);
    this.ropeTip = { ...A };

    if (this.collapseAt >= 0 && this.stateT >= this.collapseAt) {
      this.brokenAnchor = this.anchor!.id;
      this.startMiss('collapse');
      return;
    }

    // progress past the anchor along the swing direction
    const s = (h.x - A.x) * this.swingDir.x + (h.z - A.z) * this.swingDir.z;
    const phi = Math.atan2(s, A.y - h.y);
    const relPhi = clamp(this.swingPhi0 * 0.7, 0.26, 0.8);
    const auto = s > 0 && (phi >= relPhi || this.vel.y < -0.2 || this.stateT > 4);
    const early = releasePressed && s > -0.2;
    // safety: never drag feet through a roof
    const under = this.boxAt(this.p.x, this.p.z, h.y);
    const takeoff = this.firedMark ? this.boxAt(this.firedMark.x, this.firedMark.z, this.firedMark.top + 0.01, 2) : null;
    const scrape = under !== null && under.kind === 'roof' && under !== takeoff && this.p.y < under.top + 0.15;
    if (auto || early || scrape) this.release(early ? 'release_early' : 'release');
  }

  private release(ev: string): void {
    this.vel.x *= TUNE.releaseBoost;
    this.vel.z *= TUNE.releaseBoost;
    this.vel.y = Math.max(this.vel.y, 0) + TUNE.releaseLift;
    this.events.push(ev);
    this.flyTo(boxById(this.level, this.anchor!.land));
    this.clearRopeKeepAssist();
    this.setState('air');
  }

  private clearRopeKeepAssist(): void {
    const t = this.assistTarget;
    const b = this.assistBox;
    this.clearRope();
    this.assistTarget = t;
    this.assistBox = b;
  }

  /**
   * Landing assist. Keep the natural ballistic landing when it is on the target roof; otherwise
   * bend the horizontal velocity so the flight ends at least 1.6 m inside it.
   */
  private flyTo(box: Box): void {
    const g = TUNE.gravity;
    if (this.p.y < box.top + 0.4) this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * g * (box.top + 1.4 - this.p.y)));
    const dy = this.p.y - box.top;
    const t = (this.vel.y + Math.sqrt(this.vel.y * this.vel.y + 2 * g * dy)) / g;
    const nx = this.p.x + this.vel.x * t;
    const nz = this.p.z + this.vel.z * t;
    const inset = 1.6;
    const tx = clamp(nx, box.x0 + inset, box.x1 - inset);
    const tz = clamp(nz, box.z0 + inset, box.z1 - inset);
    this.vel.x = (tx - this.p.x) / t;
    this.vel.z = (tz - this.p.z) / t;
    this.assistTarget = v(tx, box.top, tz);
    this.assistBox = box.id;
  }

  // ---------- pulling (anchors below) ----------

  private stepPull(dt: number): void {
    const A = this.anchorPos!;
    const h = this.hand();
    const to = sub(A, h);
    const d = len(to);
    const speed = Math.min(TUNE.pullSpeed, len(this.vel) + TUNE.pullAccel * dt);
    const stepLen = speed * dt;
    this.ropeTip = { ...A };
    if (d <= stepLen + 0.35) {
      this.p = { x: A.x, y: A.y - HAND_HEIGHT, z: A.z };
      this.vel = v(this.swingDir.x * 5, 6, this.swingDir.z * 5);
      this.events.push('pull_arrive');
      this.flyTo(boxById(this.level, this.anchor!.land));
      this.clearRopeKeepAssist();
      this.setState('air');
      return;
    }
    const n = scale(to, 1 / d);
    this.vel = scale(n, speed);
    this.p.x += n.x * stepLen;
    this.p.y += n.y * stepLen;
    this.p.z += n.z * stepLen;
    this.yaw = Math.atan2(this.swingDir.z, this.swingDir.x);
  }

  // ---------- missing: rope short or bracket breaks ----------

  private startMiss(kind: 'miss' | 'collapse'): void {
    const m = this.firedMark!;
    const w = this.level.awnings.find((x) => x.id === m.awning)!;
    this.awning = w;
    this.falls++;
    if (this.lastOutcome) this.lastOutcome.kind = kind;
    this.events.push(kind === 'miss' ? 'short' : 'collapse');
    this.log.push({ level: this.level.id, t: this.t, action: kind, anchor: this.anchor?.id, mark: m.id, outcome: 'awning' });
    // the rope snaps back: aim the drop at the middle of the awning (a bit toward the wall)
    const g = TUNE.gravity;
    const vy = kind === 'miss' ? 4.5 : Math.max(this.vel.y, 0) + 1;
    const dy = this.p.y - w.top;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(dy, 0.1))) / g;
    // land a little toward the wall, keeping the player's sideways offset on the canvas
    const lat = clamp((this.p.x - w.x) * -w.dir.z + (this.p.z - w.z) * w.dir.x, -w.halfWide + 0.8, w.halfWide - 0.8);
    const along = -w.halfLen * 0.15;
    const tx = w.x + w.dir.x * along - w.dir.z * lat;
    const tz = w.z + w.dir.z * along + w.dir.x * lat;
    this.vel = v((tx - this.p.x) / t, vy, (tz - this.p.z) / t);
    this.ropeOk = false;
    this.setState('miss');
  }

  private stepMiss(dt: number): void {
    const prevY = this.p.y;
    this.vel.y -= TUNE.gravity * dt;
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    this.p.z += this.vel.z * dt;
    // rope recoils toward the hand
    if (this.ropeTip) {
      const h = this.hand();
      const back = sub(h, this.ropeTip);
      const bl = len(back);
      if (bl < 1 || this.stateT > 0.6) this.ropeTip = null;
      else {
        const k = Math.min(1, (TUNE.ropeSpeed * 0.6 * dt) / bl);
        this.ropeTip = { x: this.ropeTip.x + back.x * k, y: this.ropeTip.y + back.y * k - 4 * dt, z: this.ropeTip.z + back.z * k };
      }
    }
    const w = this.awning!;
    if (prevY >= w.top && this.p.y <= w.top) {
      this.p.y = w.top;
      this.startBounce();
    } else if (this.p.y < w.top - 6) {
      // safety net: never strand the player
      this.p.y = w.top;
      this.startBounce();
    }
  }

  private startBounce(): void {
    this.bounces = 0;
    this.vel = v(this.vel.x * 0.25, 7.5, this.vel.z * 0.25);
    this.ropeTip = null;
    this.anchor = null;
    this.anchorPos = null;
    this.assistTarget = null;
    this.events.push('awning');
    this.setState('bounce');
  }

  private stepBounce(dt: number): void {
    const w = this.awning!;
    this.vel.y -= TUNE.gravity * dt;
    this.p.x += this.vel.x * dt;
    this.p.y += this.vel.y * dt;
    this.p.z += this.vel.z * dt;
    if (!insideAwning(w, this.p.x, this.p.z)) {
      // stay on the canvas
      const lx = (this.p.x - w.x) * w.dir.x + (this.p.z - w.z) * w.dir.z;
      const lz = -(this.p.x - w.x) * w.dir.z + (this.p.z - w.z) * w.dir.x;
      const cx = clamp(lx, -w.halfLen + 0.3, w.halfLen - 0.3);
      const cz = clamp(lz, -w.halfWide + 0.3, w.halfWide - 0.3);
      this.p.x = w.x + cx * w.dir.x - cz * w.dir.z;
      this.p.z = w.z + cx * w.dir.z + cz * w.dir.x;
      this.vel.x = 0;
      this.vel.z = 0;
    }
    if (this.p.y <= w.top && this.vel.y < 0) {
      this.p.y = w.top;
      this.bounces++;
      if (this.bounces >= 2) {
        this.beginClimb();
        return;
      }
      this.vel.y = 3.2;
      this.events.push('awning_small');
    }
  }

  private beginClimb(): void {
    const m = this.firedMark ?? this.nearestMarkTo(this.p);
    this.firedMark = m;
    this.climbFrom = { ...this.p };
    this.climbTo = { x: m.x, y: m.top, z: m.z };
    // up the drainpipe at the wall, then over the parapet
    const w = this.awning!;
    const wallX = w.x - w.dir.x * w.halfLen;
    const wallZ = w.z - w.dir.z * w.halfLen;
    const lateral = (this.p.x - w.x) * -w.dir.z + (this.p.z - w.z) * w.dir.x;
    this.climbMid = w.straightUp
      ? { x: this.p.x, y: m.top + 0.3, z: m.z }
      : { x: wallX + -w.dir.z * lateral + w.dir.x * 0.4, y: m.top + 0.3, z: wallZ + w.dir.x * lateral + w.dir.z * 0.4 };
    this.vel = v();
    this.events.push('climb');
    this.setState('climb');
  }

  private nearestMarkTo(p: V3): Mark {
    let best = this.level.marks[0];
    let bd = Infinity;
    for (const m of this.level.marks) {
      const d = Math.hypot(m.x - p.x, m.z - p.z) + Math.abs(m.top - p.y) * 0.2;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private stepClimb(): void {
    const k = clamp(this.stateT / TUNE.climbTime, 0, 1);
    // two legs: up the wall (70% of the time), then step onto the mark
    if (k < 0.7) {
      const q = easeInOut(k / 0.7);
      this.p = {
        x: lerp(this.climbFrom.x, this.climbMid.x, Math.min(1, q * 2.2)),
        y: lerp(this.climbFrom.y, this.climbMid.y, q),
        z: lerp(this.climbFrom.z, this.climbMid.z, Math.min(1, q * 2.2)),
      };
    } else {
      const q = easeInOut((k - 0.7) / 0.3);
      this.p = {
        x: lerp(this.climbMid.x, this.climbTo.x, q),
        y: lerp(this.climbMid.y, this.climbTo.y, q) + Math.sin(q * Math.PI) * 0.35,
        z: lerp(this.climbMid.z, this.climbTo.z, q),
      };
    }
    if (k >= 1) {
      this.p = { ...this.climbTo };
      this.vel = v();
      const m = this.firedMark!;
      this.yaw = Math.atan2(m.dir.z, m.dir.x);
      this.groundBox = this.boxAt(m.x, m.z, m.top + 0.01);
      this.brokenAnchor = null;
      this.setState('ground');
      this.events.push('climbed');
    }
  }

  // ---------- reporting ----------

  /** Measured legs from the active mark's hand to every candidate anchor (what the scan may show). */
  scan(): ScanEntry[] {
    const m = this.activeMark();
    if (!m) return [];
    const L = this.level.L;
    return anchorsOfMark(this.level, m.id).map((a) => {
      const { h2, v2 } = legsSq(a);
      return {
        id: a.id,
        a: Math.sqrt(h2),
        b: a.b,
        x: a.xz?.x,
        z: a.xz?.z,
        sumSq: h2 + v2,
        reach: Math.sqrt(h2 + v2),
        reachable: h2 + v2 <= L * L,
        holds: anchorHolds(a),
        kind: a.kind,
      };
    });
  }

  medal(): 'gold' | 'silver' | 'bronze' {
    const l = this.level;
    const goldMarkOk = !l.goldMark || this.usedMarks.includes(l.goldMark);
    if (this.timer <= l.medal.gold && this.falls === 0 && goldMarkOk) return 'gold';
    if (this.timer <= l.medal.silver) return 'silver';
    return 'bronze';
  }
}

export interface ScanEntry {
  id: string;
  a: number;
  b: number;
  x?: number;
  z?: number;
  sumSq: number;
  reach: number;
  reachable: boolean;
  holds: boolean;
  kind: string;
}

export function insideAwning(w: Awning, x: number, z: number): boolean {
  const lx = (x - w.x) * w.dir.x + (z - w.z) * w.dir.z;
  const lz = -(x - w.x) * w.dir.z + (z - w.z) * w.dir.x;
  return Math.abs(lx) <= w.halfLen && Math.abs(lz) <= w.halfWide;
}

function turnToward(cur: number, target: number, maxStep: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + clamp(d, -maxStep, maxStep);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export { markById };
