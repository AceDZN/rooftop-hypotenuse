import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, anchorHolds, anchorReachable, boxById, markById, type Level } from '../src/levels.ts';
import { NO_INPUT, Sim } from '../src/sim.ts';
import { AutoPlayer, bestPlan } from '../src/autoplay.ts';

const DT = 1 / 60;

function atMark(level: Level, markId: string): Sim {
  const s = new Sim(level);
  const m = markById(level, markId);
  s.p = { x: m.x, y: m.top, z: m.z };
  s.vel = { x: 0, y: 0, z: 0 };
  s.state = 'ground';
  return s;
}

function runUntil(s: Sim, done: (s: Sim) => boolean, max = 8): number {
  let t = 0;
  while (!done(s) && t < max) {
    s.update(DT, NO_INPUT);
    t += DT;
  }
  return t;
}

for (const level of LEVELS) {
  test(`${level.id}: every legal line lands on its roof; every wrong line bounces back to the mark`, () => {
    for (const a of level.anchors) {
      const s = atMark(level, a.mark);
      s.update(DT, { ...NO_INPUT, fire: true, targetId: a.id });
      assert.equal(s.state as string, 'rope', `${level.id}.${a.id} fired`);
      const legal = anchorReachable(level, a) && anchorHolds(a);
      if (legal) {
        const t = runUntil(s, (x) => (x.state === 'ground' && x.assistTarget === null && x.stateT > 0.05) || x.finished);
        const land = boxById(level, a.land);
        assert.ok(s.state === 'ground' || s.state === 'finished', `${level.id}.${a.id} landed (t=${t.toFixed(2)}, state=${s.state})`);
        assert.equal(s.groundBox?.id, land.id, `${level.id}.${a.id} on ${land.id}, got ${s.groundBox?.id}`);
        assert.equal(s.falls, 0);
        assert.equal(s.lastOutcome?.kind, 'hit');
        assert.ok(t < 5, `${level.id}.${a.id} line takes ${t.toFixed(2)}s`);
      } else {
        const t = runUntil(s, (x) => x.state === 'ground' && x.stateT > 0.01);
        const m = markById(level, a.mark);
        assert.equal(s.state, 'ground', `${level.id}.${a.id} recovered`);
        assert.ok(Math.hypot(s.p.x - m.x, s.p.z - m.z) < 0.01 && Math.abs(s.p.y - m.top) < 0.01, `${level.id}.${a.id} back on the mark`);
        assert.equal(s.falls, 1);
        assert.equal(s.lastOutcome?.kind, anchorReachable(level, a) ? 'collapse' : 'miss');
        if (!anchorReachable(level, a)) assert.ok(s.lastOutcome!.shortBy > 0);
        assert.ok(t > 1.5 && t < 3.4, `${level.id}.${a.id} fall-and-climb takes ${t.toFixed(2)}s`);
      }
    }
  });

  test(`${level.id}: the best route finishes and earns gold with the authored thresholds`, () => {
    const s = new Sim(level);
    const ap = new AutoPlayer(s);
    ap.run(60, DT);
    assert.equal(s.finished, true, `${level.id} finished (state ${s.state}, p=${JSON.stringify(s.p)}, plan ${bestPlan(level)})`);
    assert.equal(s.falls, 0);
    assert.equal(s.medal(), 'gold', `${level.id} time ${s.timer.toFixed(2)} vs gold ${level.medal.gold}`);
    // eslint-disable-next-line no-console
    console.log(`  ${level.id} best route ${bestPlan(level).join(' → ')}: ${s.timer.toFixed(2)} s`);
  });
}

test('L3: from mark 3 the line holds but is not gold; from mark 5 it is', () => {
  const l = LEVELS.find((x) => x.id === 'L3')!;
  const s3 = new AutoPlayer(new Sim(l), ['H3']).run(60, DT);
  assert.equal(s3.finished, true);
  assert.notEqual(s3.medal(), 'gold');
  const s5 = new AutoPlayer(new Sim(l), ['H5']).run(60, DT);
  assert.equal(s5.medal(), 'gold');
});

test('a wrong line costs time and the gold medal, then the right one still finishes', () => {
  const l = LEVELS.find((x) => x.id === 'L1')!;
  const s = new AutoPlayer(new Sim(l), ['B', 'A']).run(60, DT);
  assert.equal(s.finished, true);
  assert.equal(s.falls, 1);
  assert.notEqual(s.medal(), 'gold');
  const fire = s.log.filter((e) => e.action === 'fire').map((e) => `${e.anchor}:${e.outcome}`);
  assert.deepEqual(fire, ['B:short', 'A:reach']);
});

test('running and jumping clear the L1 warm-up gap', () => {
  const l = LEVELS.find((x) => x.id === 'L1')!;
  const s = new Sim(l);
  let t = 0;
  while (t < 2.2) {
    const jump = s.p.x > -10.2 && s.state === 'ground' && s.groundBox?.id === 'R0';
    s.update(DT, { ...NO_INPUT, moveX: 1, jump });
    t += DT;
  }
  assert.equal(s.groundBox?.id, 'R1');
  assert.equal(s.falls, 0);
});

test('fire far from the mark is refused; within 7 m it dashes', () => {
  const l = LEVELS.find((x) => x.id === 'L1')!;
  const s = new Sim(l);
  s.update(DT, { ...NO_INPUT, fire: true, targetId: 'A' });
  assert.equal(s.state, 'ground');
  assert.ok(s.events.includes('too_far'));
  s.p = { x: -4, y: 15, z: 0 };
  s.update(DT, { ...NO_INPUT, fire: true, targetId: 'A' });
  assert.equal(s.state, 'dash');
});

test('focus slows simulated time to 15% and drains the meter', () => {
  const l = LEVELS[0];
  const s = new Sim(l);
  s.update(1, { ...NO_INPUT, focus: true, moveX: 1 });
  assert.ok(Math.abs(s.t - 0.15) < 1e-9);
  assert.ok(s.focus < 0.7);
});

test('determinism: same inputs, same state', () => {
  const l = LEVELS[3];
  const a = new AutoPlayer(new Sim(l)).run(60, DT);
  const b = new AutoPlayer(new Sim(l)).run(60, DT);
  assert.equal(a.timer, b.timer);
  assert.deepEqual(a.p, b.p);
});
