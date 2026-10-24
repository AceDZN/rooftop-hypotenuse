import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hintTerms,
  includedAngleDeg,
  isReachable,
  isReachable2,
  isRightTriangle,
  maxTakeoff,
  reach2,
  reachSq,
  shortBy,
} from '../src/rules.ts';
import { LEVELS, anchorHolds, anchorReachSq, anchorReachable, levelById } from '../src/levels.ts';

test('compares squares: exact triples sit exactly on the limit', () => {
  assert.equal(isReachable2(3, 4, 5), true);
  assert.equal(isReachable2(6, 8, 10), true);
  assert.equal(isReachable2(8, 15, 17), true);
  assert.equal(isReachable2(5, 12, 13), true);
  assert.equal(isReachable2(4, 4, 5), false);
  assert.equal(reach2(3, 4), 5);
});

test('the sign of the vertical leg never matters', () => {
  assert.equal(isReachable2(12, -5, 13), isReachable2(12, 5, 13));
  assert.equal(isReachable2(11, -7, 13), false);
  assert.equal(reachSq({ x: 12, y: -5, z: 0 }), 169);
});

test('space: x² + z² + y² (box diagonal)', () => {
  assert.equal(reachSq({ x: 6, y: 24, z: 8 }), 676);
  assert.equal(isReachable({ x: 6, y: 24, z: 8 }, 26), true);
  assert.equal(isReachable({ x: 8, y: 24, z: 8 }, 26), false);
  assert.ok(Math.abs(shortBy({ x: 8, y: 24, z: 8 }, 26) - 0.5329) < 1e-3);
});

test('finding a leg: max take-off √(L² − b²)', () => {
  assert.equal(maxTakeoff(13, 12), 5);
  assert.ok(Number.isNaN(maxTakeoff(5, 6)));
});

test('converse: only right triangles', () => {
  assert.equal(isRightTriangle(6, 8, 10), true);
  assert.equal(isRightTriangle(6, 8, 11), false);
  assert.equal(isRightTriangle(9, 12, 15), true);
  assert.equal(isRightTriangle(9, 12, 16), false);
  assert.equal(Math.round(includedAngleDeg(6, 8, 10)), 90);
  assert.ok(includedAngleDeg(6, 8, 11) > 100);
});

test('hint fills the numbers but never the answer', () => {
  const h = hintTerms({ x: 3, y: 4, z: 0 }, 5);
  assert.equal(h.terms, '3² + 4² = ?');
  assert.equal(h.target, 'L² = 5² = 25');
  assert.ok(!h.terms.includes('25'));
  assert.equal(hintTerms({ x: 6, y: 24, z: 8 }, 26).terms, '6² + 8² + 24² = ?');
});

/** [level, anchor, reachable, reach] straight from BUILD_HANDOFF.md */
const SPEC: [string, string, boolean, number][] = [
  ['L1', 'A', true, 5],
  ['L1', 'B', false, 5.657],
  ['L2', 'A', true, 10],
  ['L2', 'B', false, 10.63],
  ['L2', 'C', true, 9.487],
  ['L3', 'H5', true, 13],
  ['L3', 'H6', false, 13.416],
  ['L4', 'A1', true, 17],
  ['L4', 'D1', false, 17.205],
  ['L4', 'A2', true, 15],
  ['L4', 'A3', true, 13],
  ['L6', 'A', true, 26],
  ['L6', 'D', false, 26.533],
  ['L8', 'A', true, 15],
  ['L8', 'B', true, 14.866],
  ['L8', 'C', false, 15.62],
  ['L8', 'E', true, 13],
];

test('every authored anchor matches the handoff numbers', () => {
  for (const [lid, aid, ok, r] of SPEC) {
    const l = levelById(lid);
    const a = l.anchors.find((x) => x.id === aid)!;
    assert.ok(a, `${lid}.${aid} exists`);
    assert.equal(anchorReachable(l, a), ok, `${lid}.${aid} reachable=${ok}`);
    assert.ok(Math.abs(Math.sqrt(anchorReachSq(a)) - r) < 0.01, `${lid}.${aid} reach ${Math.sqrt(anchorReachSq(a))} ≈ ${r}`);
  }
});

test('L3: marks 1–5 reach, 6–10 fall short', () => {
  const l = levelById('L3');
  for (let n = 1; n <= 10; n++) {
    const a = l.anchors.find((x) => x.id === `H${n}`)!;
    assert.equal(anchorReachable(l, a), n <= 5, `mark ${n}`);
  }
});

test('L5 downswing: E/G reach, F misses by 4 cm, D misses', () => {
  const l = levelById('L5');
  const get = (id: string) => l.anchors.find((x) => x.id === id)!;
  assert.equal(anchorReachable(l, get('A')), true);
  assert.equal(anchorReachable(l, get('C')), true);
  assert.equal(anchorReachable(l, get('D')), false);
  assert.equal(anchorReachable(l, get('E')), true);
  assert.equal(anchorReachable(l, get('G')), true);
  assert.equal(anchorReachable(l, get('F')), false);
  assert.ok(Math.abs(Math.sqrt(anchorReachSq(get('F'))) - 13 - 0.0384) < 1e-3);
});

test('L7: every hook is in reach, only right-angle frames hold', () => {
  const l = levelById('L7');
  for (const a of l.anchors) assert.equal(anchorReachable(l, a), true, a.id);
  const holds = Object.fromEntries(l.anchors.map((a) => [a.id, anchorHolds(a)]));
  assert.deepEqual(holds, { A: true, B: false, C: false, E: true });
});

test('every level has a legal route and at least one tempting wrong line', () => {
  for (const l of LEVELS) {
    const marksWithAnchors = new Set(l.anchors.map((a) => a.mark));
    for (const mid of marksWithAnchors) {
      const group = l.anchors.filter((a) => a.mark === mid);
      if (l.id === 'L3') continue; // L3 has one hook per numbered mark
      assert.ok(group.some((a) => anchorReachable(l, a) && anchorHolds(a)), `${l.id}.${mid} has a legal line`);
    }
    assert.ok(l.anchors.some((a) => !anchorReachable(l, a) || !anchorHolds(a)), `${l.id} has a wrong line`);
  }
});

test('transfer level hides hints and labels', () => {
  const l = levelById('L8');
  assert.equal(l.hints, false);
  assert.equal(l.scanLabels, false);
  assert.equal(l.night, true);
});
