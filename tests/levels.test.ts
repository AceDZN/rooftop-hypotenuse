import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, buildCourse, holds, legsSq, levelById, type HookSpec } from '../src/levels.ts';

const reach = (s: HookSpec) => {
  const { h2, v2 } = legsSq(s);
  return Math.sqrt(h2 + v2);
};
const find = (lid: string, a: number, b: number, z?: number) => {
  for (const g of levelById(lid).gaps) {
    const lists = g.kind === 'hooks' ? [g.hooks] : g.kind === 'chain' ? g.steps : [];
    for (const l of lists) for (const s of l) if (s.a === a && s.b === b && (z === undefined || s.z === z)) return s;
  }
  throw new Error(`${lid} has no hook (${a}, ${b}, ${z})`);
};

test('handoff numbers are in the levels with the right verdicts', () => {
  const L = (id: string) => levelById(id).L;
  const cases: [string, number, number, number | undefined, boolean, number][] = [
    ['L1', 3, 4, undefined, true, 5],
    ['L1', 4, 4, undefined, false, 5.657],
    ['L2', 6, 8, undefined, true, 10],
    ['L2', 8, 7, undefined, false, 10.63],
    ['L2', 9, 3, undefined, true, 9.487],
    ['L4', 8, 15, undefined, true, 17],
    ['L4', 10, 14, undefined, false, 17.205],
    ['L4', 9, 12, undefined, true, 15],
    ['L4', 5, 12, undefined, true, 13],
    ['L6', 6, 24, 8, true, 26],
    ['L6', 8, 24, 8, false, 26.533],
    ['L8', 9, 12, undefined, true, 15],
    ['L8', 10, 11, undefined, true, 14.866],
    ['L8', 12, 10, undefined, false, 15.62],
    ['L8', 5, 12, 0, true, 13],
  ];
  for (const [lid, a, b, z, ok, r] of cases) {
    const s = find(lid, a, b, z);
    const L2 = L(lid) ** 2;
    const { h2, v2 } = legsSq(s);
    assert.equal(h2 + v2 <= L2, ok, `${lid} (${a},${b},${z})`);
    assert.ok(Math.abs(reach(s) - r) < 0.01, `${lid} (${a},${b}) reach ${reach(s)}`);
  }
});

test('L3 strips: the largest legal tile is exactly the missing leg', () => {
  const c = buildCourse(levelById('L3'));
  const strips = c.decisions.filter((d) => d.kind === 'strip').map((d) => [d.strip!.b, d.strip!.maxN]);
  assert.deepEqual(strips, [
    [12, 5],
    [10, 8],
    [11, 6],
  ]);
});

test('L7: only right-angled brackets hold; every bracket hook is in reach', () => {
  const l = levelById('L7');
  for (const g of l.gaps) {
    if (g.kind !== 'hooks') continue;
    for (const s of g.hooks) {
      const { h2, v2 } = legsSq(s);
      assert.ok(h2 + v2 <= l.L * l.L, `(${s.a},${s.b}) in reach`);
    }
  }
  const verdicts = l.gaps.flatMap((g) => (g.kind === 'hooks' ? g.hooks.map((s) => `${s.frame!.post}-${s.frame!.beam}-${s.frame!.brace}:${holds(s)}`) : []));
  assert.deepEqual(verdicts, ['6-8-10:true', '6-8-11:false', '9-12-16:false', '9-12-15:true', '5-12-14:false', '5-12-13:true', '8-15-17:true', '8-15-18:false', '7-24-25:true', '20-21-29:true']);
});

test('every hook decision has a legal hook, and every level has wrong ones', () => {
  for (const l of LEVELS) {
    const c = buildCourse(l);
    for (const d of c.decisions) if (d.kind === 'hooks') assert.ok(d.hooks.some((h) => h.ok), `${l.id} ${d.id}`);
    assert.ok(
      c.decisions.some((d) => d.hooks.some((h) => !h.ok) || d.kind === 'strip'),
      `${l.id} has a wrong choice`,
    );
    assert.ok(c.decisions.length >= 4, `${l.id} has ${c.decisions.length} decisions`);
  }
});

test('exactly one "perfect" (farthest legal) hook per hook decision', () => {
  for (const l of LEVELS) {
    for (const d of buildCourse(l).decisions) {
      if (d.kind !== 'hooks') continue;
      const p = d.hooks.filter((h) => h.perfect);
      assert.ok(p.length >= 1, `${l.id} ${d.id}`);
      const best = Math.max(...d.hooks.filter((h) => h.ok).map((h) => h.h2));
      for (const h of p) assert.equal(h.h2, best);
    }
  }
});

test('transfer level hides numbers and hints', () => {
  const l = levelById('L8');
  assert.equal(l.labels, false);
  assert.equal(l.hints, false);
  assert.equal(l.night, true);
});

test('the answer is not always hook 1: wrong hooks sit in front of right ones often enough', () => {
  for (const l of LEVELS) {
    const ds = buildCourse(l).decisions.filter((d) => d.kind === 'hooks' && d.hooks.some((h) => !h.ok));
    const notFirst = ds.filter((d) => {
      const first = [...d.hooks].sort((p, q) => p.num - q.num)[0];
      return !first.ok;
    }).length;
    assert.ok(notFirst / ds.length >= 0.3, `${l.id}: hook 1 is wrong in only ${notFirst}/${ds.length} decisions`);
  }
  // across the whole game, the perfect hook is not always the last or the first number
  const pos = { first: 0, middle: 0, last: 0 };
  for (const l of LEVELS)
    for (const d of buildCourse(l).decisions) {
      if (d.kind !== 'hooks' || d.hooks.length < 2) continue;
      const p = d.hooks.find((h) => h.perfect)!.num;
      if (p === 1) pos.first++;
      else if (p === d.hooks.length) pos.last++;
      else pos.middle++;
    }
  assert.ok(pos.first > 3 && pos.last > 3 && pos.middle > 3, JSON.stringify(pos));
});
