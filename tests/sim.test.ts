import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, levelById } from '../src/levels.ts';
import { NO_INPUT, Sim } from '../src/sim.ts';
import { AutoPlayer, bestPolicy, wrongFirstPolicy } from '../src/autoplay.ts';

const DT = 1 / 60;

/** Runs a player and fails if the runner's feet ever go inside a roof (wall clipping). */
function runChecked(ap: AutoPlayer, max = 300): { sim: Sim; clips: string[]; seconds: number } {
  const s = ap.sim;
  const clips: string[] = [];
  let t = 0;
  while (!s.finished && t < max) {
    s.update(DT, ap.input());
    t += DT;
    if (s.state === 'climb') continue;
    for (const r of s.course.roofs) {
      const inside = s.p.x > r.x0 + 0.05 && s.p.x < r.x1 - 0.05 && s.p.z > r.z0 && s.p.z < r.z1 && s.p.y < r.top - 0.15 && s.p.y > r.top - 40;
      if (inside) clips.push(`${s.state} in ${r.id} at x=${s.p.x.toFixed(2)} y=${s.p.y.toFixed(2)} (top ${r.top})`);
    }
  }
  return { sim: s, clips, seconds: t };
}

for (const level of LEVELS) {
  test(`${level.id}: best play finishes with 3 stars and never clips a roof`, () => {
    const { sim, clips, seconds } = runChecked(new AutoPlayer(new Sim(level), bestPolicy));
    assert.equal(sim.finished, true, `${level.id} finished (state ${sim.state} at ${JSON.stringify(sim.p)})`);
    assert.deepEqual(clips.slice(0, 3), []);
    assert.equal(sim.misses, 0);
    assert.equal(sim.decided, sim.course.decisions.length);
    assert.equal(sim.stars(), 3);
    // eslint-disable-next-line no-console
    console.log(`  ${level.id}: ${sim.course.decisions.length} decisions, ${seconds.toFixed(1)} s of play`);
  });

  test(`${level.id}: trying every wrong hook first still finishes; each miss comes back to the choice`, () => {
    const ap = new AutoPlayer(new Sim(level), wrongFirstPolicy);
    // strips: jump one tile too far first
    for (const d of ap.sim.course.decisions) if (d.kind === 'strip') ap.stripTiles[d.id] = d.strip!.maxN + 1;
    const wrongHooks = ap.sim.course.decisions.reduce((n, d) => n + d.hooks.filter((h) => !h.ok).length, 0);
    const strips = ap.sim.course.decisions.filter((d) => d.kind === 'strip').length;
    let misses = 0;
    let backToChoice = 0;
    const s = ap.sim;
    let t = 0;
    let prevMisses = 0;
    while (!s.finished && t < 400) {
      // after one wrong strip jump, jump at the right tile
      if (s.state === 'strip' && s.decision && s.missedHere) ap.stripTiles[s.decision.id] = s.decision.strip!.maxN;
      const inp = ap.input();
      s.update(DT, inp);
      t += DT;
      if (s.misses > prevMisses) {
        misses++;
        prevMisses = s.misses;
      }
      if (s.events.includes('canopy')) backToChoice++;
      s.events.length = 0;
    }
    assert.equal(s.finished, true, `${level.id} finished`);
    assert.equal(misses, wrongHooks + strips);
    assert.equal(backToChoice, misses);
    assert.equal(s.stars(), 1);
  });
}

test('L1 first gap: (4,4) falls short by 0.66 m and the hook greys out', () => {
  const s = new Sim(levelById('L1'));
  while (s.state !== 'decide') s.update(DT, NO_INPUT);
  const bad = s.choices().find((h) => h.spec.a === 4 && h.spec.b === 4)!;
  s.update(DT, { hook: bad.id, jump: false });
  while (s.state !== 'decide') s.update(DT, NO_INPUT);
  assert.ok(Math.abs(s.lastOutcome!.shortBy - 0.657) < 0.001);
  assert.equal(s.lastOutcome!.kind, 'miss');
  assert.equal(s.choices().length, 1);
  assert.equal(s.combo, 0);
});

test('L3 strip: tile 6 misses, tile 5 is perfect', () => {
  const s = new Sim(levelById('L3'));
  const ap = new AutoPlayer(s, bestPolicy);
  const strip = s.course.decisions.find((d) => d.kind === 'strip')!;
  ap.stripTiles[strip.id] = 6;
  while (!(s.lastOutcome && s.lastOutcome.decision === strip.id)) s.update(DT, ap.input());
  assert.equal(s.lastOutcome!.kind, 'miss');
  assert.equal(s.lastOutcome!.tile, 6);
  ap.stripTiles[strip.id] = 5;
  while ((s.lastOutcome!.tile as number) !== 5) s.update(DT, ap.input());
  assert.equal(s.lastOutcome!.kind, 'hit');
  assert.equal(s.lastOutcome!.perfect, true);
});

test('L7: a crooked bracket breaks after the rope catches', () => {
  const s = new Sim(levelById('L7'));
  while (s.state !== 'decide') s.update(DT, NO_INPUT);
  const crooked = s.choices().find((h) => !h.holds)!;
  s.update(DT, { hook: crooked.id, jump: false });
  const seen = new Set<string>();
  while (s.state !== 'decide' || seen.size === 0) {
    s.update(DT, NO_INPUT);
    seen.add(s.state);
  }
  assert.ok(seen.has('swing'));
  assert.ok(seen.has('miss'));
  assert.equal(s.lastOutcome!.kind, 'collapse');
});

test('time freezes while deciding: the run timer does not count thinking', () => {
  const s = new Sim(levelById('L2'));
  while (s.state !== 'decide') s.update(DT, NO_INPUT);
  const t0 = s.timer;
  s.update(30, NO_INPUT);
  assert.equal(s.state, 'decide');
  assert.equal(s.timer, t0);
});

test('determinism', () => {
  const a = new AutoPlayer(new Sim(LEVELS[3])).run();
  const b = new AutoPlayer(new Sim(LEVELS[3])).run();
  assert.equal(a.timer, b.timer);
  assert.deepEqual(a.p, b.p);
});
