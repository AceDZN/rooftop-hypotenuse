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

