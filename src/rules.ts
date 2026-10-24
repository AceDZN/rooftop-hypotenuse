// Pure reach math for the grapple. No Three.js here: the scene only renders these results.
// Every decision compares squared lengths so exact Pythagorean cases (3-4-5, 8-15-17...) never
// fail on floating-point noise.

export interface Offset3 {
  /** world X offset from the grapple hand to the anchor, metres */
  x: number;
  /** vertical offset (up is positive), metres */
  y: number;
  /** world Z offset, metres */
  z: number;
}

/** Squared horizontal leg: a² = x² + z² (Pythagoras on the floor). */
export function horizontalSq(o: Offset3): number {
  return o.x * o.x + o.z * o.z;
}

/** Squared straight reach: x² + z² + y² (the box diagonal). */
export function reachSq(o: Offset3): number {
  return horizontalSq(o) + o.y * o.y;
}

/** Straight-line reach √(a² + b²) for a horizontal leg a and vertical leg b. */
export function reach2(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

export function reach(o: Offset3): number {
  return Math.sqrt(reachSq(o));
}

/** Reachable iff a² + b² ≤ L². The sign of b never matters because it is squared. */
export function isReachable2(a: number, b: number, L: number): boolean {
  return a * a + b * b <= L * L;
}

export function isReachable(o: Offset3, L: number): boolean {
  return reachSq(o) <= L * L;
}

/** How far the rope falls short (0 when it reaches). Display value, not used for decisions. */
export function shortBy(o: Offset3, L: number): number {
  return isReachable(o, L) ? 0 : reach(o) - L;
}

/**
 * Finding a leg: with rope L and height b, the farthest legal take-off distance is √(L² − b²).
 * Returns NaN when even standing directly underneath cannot reach.
 */
export function maxTakeoff(L: number, b: number): number {
  const d = L * L - b * b;
  return d < 0 ? Number.NaN : Math.sqrt(d);
}

/** Converse of Pythagoras: sides p, q, r (r the longest) make a right angle iff p² + q² = r². */
export function isRightTriangle(p: number, q: number, r: number): boolean {
  const s = [p, q, r].sort((m, n) => m - n);
  return s[0] * s[0] + s[1] * s[1] === s[2] * s[2];
}

/** Angle (degrees) between the two shorter sides, by the law of cosines. Used to lean a crooked frame. */
export function includedAngleDeg(p: number, q: number, r: number): number {
  const c = (p * p + q * q - r * r) / (2 * p * q);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** "a² + b² = ?" text pieces for the optional hint. Numbers only, never the answer. */
export function hintTerms(o: Offset3, L: number): { terms: string; target: string } {
  const parts: string[] = [];
  const is3d = o.x !== 0 && o.z !== 0;
  if (is3d) {
    parts.push(`${fmt(Math.abs(o.x))}²`, `${fmt(Math.abs(o.z))}²`);
  } else {
    parts.push(`${fmt(Math.sqrt(horizontalSq(o)))}²`);
  }
  parts.push(`${fmt(Math.abs(o.y))}²`);
  return { terms: `${parts.join(' + ')} = ?`, target: `L² = ${fmt(L)}² = ${fmt(L * L)}` };
}

export function fmt(n: number, digits = 2): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r);
}
