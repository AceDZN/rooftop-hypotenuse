// v2 levels: a side-view swing runner. Each level is a list of gaps; `buildCourse` turns that into
// exact world geometry. Pure data and math, no Three.js.
// Axes: +X is the running direction (screen right), +Y up, +Z toward the camera.
// Every hook is measured from the decision point P: the grapple hand at the top of the leap.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Frame {
  post: number;
  beam: number;
  brace: number;
}

export interface HookSpec {
  /** horizontal leg along the course (m); for space hooks this is the x leg */
  a: number;
  /** vertical leg (m), negative = below the hand */
  b: number;
  /** space hooks: z leg (m) toward the camera; the horizontal leg becomes √(a² + z²) */
  z?: number;
  frame?: Frame;
}

export type GapSpec =
  | { kind: 'hooks'; hooks: HookSpec[] }
  | { kind: 'strip'; b: number }
  | { kind: 'chain'; steps: HookSpec[][] };

export interface LevelSpec {
  id: string;
  num: number;
  title: string;
  subtitle: string;
  goal: string;
  L: number;
  night: boolean;
  hints: boolean;
  labels: boolean;
  space?: boolean;
  gaps: GapSpec[];
  lesson: string;
  /** coach bubble shown the first time this level's twist appears */
  coach: string;
  /** coach bubble for the first jump strip (level 3) */
  coachStrip?: string;
}

export type HookKind = 'swing' | 'pull' | 'bracket';

export interface Hook {
  id: string;
  /** 1-based number shown on the badge (left to right) */
  num: number;
  spec: HookSpec;
  kind: HookKind;
  pos: V3;
  /** exact squared legs */
  h2: number;
  v2: number;
  reachSq: number;
  reaches: boolean;
  holds: boolean;
  ok: boolean;
  perfect: boolean;
}

export interface Canopy {
  x0: number;
  x1: number;
  z: number;
  top: number;
}

export interface Roof {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  kind: 'roof' | 'walkway';
}

export interface Strip {
  /** x of the point under the hook ("0") */
  foot: number;
  top: number;
  b: number;
  /** largest legal tile number */
  maxN: number;
}

export interface Decision {
  id: string;
  index: number;
  kind: 'hooks' | 'strip';
  /** grapple hand at the decision (strips: the walkway start) */
  P: V3;
  /** roof edge where the leap starts, or null for mid-air chain steps */
  edge: number | null;
  hooks: Hook[];
  canopy: Canopy;
  land: Roof;
  /** next chain step (decided mid-air) */
  next: Decision | null;
  chainStep: number;
  camYaw: number;
  strip?: Strip;
}

export interface CourseEvent {
  x: number;
  type: 'decision' | 'climb' | 'finish';
  decision?: Decision;
  /** climb: target top */
  top?: number;
  z: number;
}

export interface Course {
  level: LevelSpec;
  roofs: Roof[];
  decisions: Decision[];
  events: CourseEvent[];
  start: V3;
  finish: V3;
}

export const HAND = 1;
const LEAP_X = 1.4;
const LEAP_Y = 0.9;
const BASE_TOP = 34;
const MIN_TOP = 12;

const h = (a: number, b: number, extra: Partial<HookSpec> = {}): HookSpec => ({ a, b, ...extra });
const fr = (post: number, beam: number, brace: number): Frame => ({ post, beam, brace });

export const LEVELS: LevelSpec[] = [
  {
    id: 'L1',
    coach: 'הזמן עצר! לכל וו רואים כמה רחוק (↔) וכמה גבוה (↕). החבל 5 מ׳. הקישו על וו שהקו הישר אליו לא ארוך מ־5.',
    num: 1,
    title: 'קו ראשון',
    subtitle: 'החבל באורך 5 מ׳. בכל קפיצה הזמן כמעט עוצר: הקישו על הוו שהחבל מגיע אליו.',
    goal: 'הסורק מראה רק כמה רחוק לרוחב (↔) וכמה גבוה (↕). המרחק הישר הוא היתר.',
    L: 5,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'hooks', hooks: [h(3, 4), h(4, 4)] },
      { kind: 'hooks', hooks: [h(2, 5), h(4, 3)] },
      { kind: 'hooks', hooks: [h(1, 5), h(3, 4)] },
      { kind: 'hooks', hooks: [h(4, 2), h(5, 1)] },
      { kind: 'hooks', hooks: [h(3, 5), h(4, 2)] },
      { kind: 'hooks', hooks: [h(2, 5), h(3, 4), h(4, 4)] },
    ],
    lesson: 'היתר הוא הצלע הארוכה: 3² + 4² = 9 + 16 = 25 = 5². בדיוק באורך החבל, ולכן מגיע.',
  },
  {
    id: 'L2',
    coach: 'שלושה ווים. ⭐ מקבל מי שבוחר את הרחוק ביותר שעדיין מגיע. בדקו: a² + b² ≤ 100.',
    num: 2,
    title: 'בחרו את הרחוק',
    subtitle: 'L = 10. שלושה ווים, לפחות אחד לא מגיע. הוו הרחוק ביותר שעדיין מגיע נותן ⭐.',
    goal: 'משווים a² + b² ל־L² = 100. לא צריך שורש כדי להחליט.',
    L: 10,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'hooks', hooks: [h(6, 8), h(8, 7), h(9, 3)] },
      { kind: 'hooks', hooks: [h(3, 10), h(6, 8), h(9, 5)] },
      { kind: 'hooks', hooks: [h(4, 9), h(5, 9), h(8, 6)] },
      { kind: 'hooks', hooks: [h(2, 10), h(7, 7), h(10, 1)] },
      { kind: 'hooks', hooks: [h(5, 9), h(8, 5), h(9, 4)] },
      { kind: 'hooks', hooks: [h(6, 8), h(7, 8), h(9, 5)] },
      { kind: 'hooks', hooks: [h(4, 10), h(6, 7), h(8, 6)] },
    ],
    lesson: '6² + 8² = 100 ≤ 100 ו־9² + 3² = 90 ≤ 100 מגיעים. 8² + 7² = 113 > 100 לא מגיע.',
  },
  {
    id: 'L3',
    coach: 'הוו גבוה: ↕ גדול. גם כך בודקים a² + b² ≤ 169.',
    coachStrip: 'פיגום! הוו 12 מ׳ מעל, החבל 13. מאיזה מספר אפשר לקפוץ? הקישו על מספר על הפיגום.',
    num: 3,
    title: 'מאיפה לקפוץ',
    subtitle: 'L = 13. על הפיגום מספרים: כמה מטרים עד מתחת לוו. הקישו "קפיצה" בזמן.',
    goal: 'מוצאים ניצב: √(L² − b²). הקפיצה הרחוקה ביותר שעדיין מגיעה נותנת ⭐.',
    L: 13,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'hooks', hooks: [h(3, 13), h(5, 12)] },
      { kind: 'strip', b: 12 },
      { kind: 'hooks', hooks: [h(10, 7), h(11, 7), h(12, 5)] },
      { kind: 'strip', b: 10 },
      { kind: 'strip', b: 11 },
    ],
    lesson: '√(13² − 12²) = √25 = 5. ‏√(169 − 100) ≈ 8.3, אז 8. ‏√(169 − 121) ≈ 6.9, אז 6.',
  },
  {
    id: 'L4',
    coach: 'בחירה באוויר! אחרי כל תפיסה הווים הבאים כבר מחכים. זהו שלשות: 8-15-17, 9-12-15, 5-12-13.',
    num: 4,
    title: 'שרשרת שלשות',
    subtitle: 'חבל 17 מ׳. בחרו את הוו הבא עוד באוויר.',
    goal: 'שלשות פיתגוריות: 8-15-17, 9-12-15, 5-12-13. מי שמזהה אותן מחליט מהר.',
    L: 17,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'chain', steps: [[h(6, 16), h(8, 15)], [h(9, 12), h(11, 13)], [h(5, 12), h(12, 5), h(16, 6)]] },
      { kind: 'hooks', hooks: [h(12, 12), h(15, 8), h(16, 6)] },
      { kind: 'chain', steps: [[h(10, 14), h(12, 9)], [h(4, 17), h(8, 15), h(12, 12)]] },
    ],
    lesson: '8-15-17, ‏9-12-15 (זה 3-4-5 כפול 3), ‏5-12-13. ו־12² + 12² = 288 ≤ 289: מגיע בקושי!',
  },
  {
    id: 'L5',
    coach: 'הווים מתחתיכם. ↓ הוא ניצב רגיל: (−5)² = 25.',
    num: 5,
    title: 'גלישה למטה',
    subtitle: 'L = 13. חלק מהווים מתחתיכם: החבל מושך אתכם ישר אליהם.',
    goal: 'גם כשהוו נמוך, הגובה נכנס בריבוע: (−5)² = 25. הסימן לא משנה.',
    L: 13,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'hooks', hooks: [h(5, -12), h(9, -10), h(12, -5)] },
      { kind: 'hooks', hooks: [h(3, -13), h(8, -9), h(11, -7)] },
      { kind: 'hooks', hooks: [h(4, -13), h(10, -8), h(12, -5)] },
      { kind: 'hooks', hooks: [h(1, -13), h(5, -12), h(12, 5)] },
    ],
    lesson: 'מרחק תמיד חיובי: 12² + (−5)² = 144 + 25 = 169 = 13². וו למעלה (12, 5) ווו למטה (12, −5) באותו מרחק. ‏1² + (−13)² = 170 > 169: חסר 4 ס״מ.',
  },
  {
    id: 'L6',
    coach: 'תלת־ממד! x לאורך, z לעומק, ↕ לגובה. קודם x² + z² על הרצפה, ואז מוסיפים ↕².',
    num: 6,
    title: 'החצר (פיתגורס במרחב)',
    subtitle: 'L = 26. הווים מעל חצרות: x לאורך, z לעומק, ↕ לגובה.',
    goal: 'פעמיים פיתגורס: קודם על הרצפה (x² + z²), אחר כך באוויר (+ y²).',
    L: 26,
    night: false,
    hints: true,
    labels: true,
    space: true,
    gaps: [
      { kind: 'hooks', hooks: [h(6, 24, { z: 8 }), h(8, 24, { z: 8 })] },
      { kind: 'hooks', hooks: [h(4, 25, { z: 8 }), h(8, 24, { z: 6 })] },
      { kind: 'hooks', hooks: [h(10, 22, { z: 10 }), h(12, 20, { z: 9 })] },
      { kind: 'hooks', hooks: [h(16, 18, { z: 12 }), h(16, 16, { z: 12 })] },
    ],
    lesson: 'על הרצפה: 6² + 8² = 100, כלומר 10 מ׳. באוויר: 10² + 24² = 676 = 26².',
  },
  {
    id: 'L7',
    coach: 'כל הווים בטווח! רק זרוע עם זווית ישרה תחזיק. בדקו את צלעות הזרוע: p² + q² = r²?',
    num: 7,
    title: 'הזרוע העקומה',
    subtitle: 'L = 15. כל הווים בטווח, אבל רק זרוע עם זווית ישרה מחזיקה.',
    goal: 'המשפט ההפוך: אם p² + q² = r², הזווית ישרה. אם לא, הזרוע תתפרק.',
    L: 15,
    night: false,
    hints: true,
    labels: true,
    gaps: [
      { kind: 'hooks', hooks: [h(6, 8, { frame: fr(6, 8, 10) }), h(11, 5, { frame: fr(6, 8, 11) })] },
      { kind: 'hooks', hooks: [h(8, 6, { frame: fr(9, 12, 16) }), h(12, 5, { frame: fr(9, 12, 15) })] },
      { kind: 'hooks', hooks: [h(9, 9, { frame: fr(5, 12, 14) }), h(10, 8, { frame: fr(5, 12, 13) })] },
      { kind: 'hooks', hooks: [h(7, 10, { frame: fr(8, 15, 17) }), h(12, 6, { frame: fr(8, 15, 18) })] },
      { kind: 'hooks', hooks: [h(10, 9, { frame: fr(7, 24, 25) }), h(12, 8, { frame: fr(20, 21, 29) })] },
    ],
    lesson: 'המשפט ההפוך: 6² + 8² = 100 = 10² ✓, ‏9² + 12² = 225 = 15² ✓. אבל 11² = 121 ו־16² = 256 לא מתאימים.',
  },
  {
    id: 'L8',
    coach: 'בלי מספרים. השורה הלבנה = ↔, העמודה בצבע הוו = ↕. כל נורה מטר, נורה גדולה = 5.',
    num: 8,
    title: 'ריצת לילה',
    subtitle: 'L = 15. בלי מספרים ובלי רמזים. ספרו נורות: כל נורה מטר.',
    goal: 'מבחן העברה: קוראים את הניצבים מהעולם עצמו.',
    L: 15,
    night: true,
    hints: false,
    labels: false,
    gaps: [
      { kind: 'hooks', hooks: [h(9, 12), h(10, 11), h(12, 10)] },
      { kind: 'hooks', hooks: [h(5, 15), h(12, 9), h(13, 8)] },
      { kind: 'hooks', hooks: [h(2, 15, { z: 0 }), h(5, 12, { z: 0 }), h(8, 12, { z: 6 })] },
      { kind: 'hooks', hooks: [h(7, 14), h(9, 12), h(10, 12)] },
      { kind: 'hooks', hooks: [h(6, 14), h(11, 10)] },
    ],
    lesson: 'ספרתם 9 ו־12 (225), 10 ו־11 (221), ו־12 ו־10 (244 > 225). אותו חשבון, בלי מספרים על המסך.',
  },
];

// ---------- exact checks ----------

export function legsSq(s: HookSpec): { h2: number; v2: number } {
  const z = s.z ?? 0;
  return { h2: s.a * s.a + z * z, v2: s.b * s.b };
}

export function holds(s: HookSpec): boolean {
  if (!s.frame) return true;
  const { post, beam, brace } = s.frame;
  return post * post + beam * beam === brace * brace;
}

// ---------- course builder ----------

function makeHooks(level: LevelSpec, did: string, specs: HookSpec[], P: V3): Hook[] {
  const L2 = level.L * level.L;
  const hooks: Hook[] = specs.map((s, i) => {
    const { h2, v2 } = legsSq(s);
    const reachSq = h2 + v2;
    const reaches = reachSq <= L2;
    const hl = holds(s);
    const kind: HookKind = s.frame ? 'bracket' : s.b < 0 ? 'pull' : 'swing';
    return {
      id: `${did}h${i + 1}`,
      num: 0,
      spec: s,
      kind,
      pos: { x: P.x + s.a, y: P.y + s.b, z: P.z + (s.z ?? 0) },
      h2,
      v2,
      reachSq,
      reaches,
      holds: hl,
      ok: reaches && hl,
      perfect: false,
    };
  });
  // badges numbered left to right
  [...hooks].sort((p, q) => p.pos.x - q.pos.x || p.pos.z - q.pos.z).forEach((hk, i) => (hk.num = i + 1));
  const best = Math.max(...hooks.filter((x) => x.ok).map((x) => x.h2));
  for (const hk of hooks) hk.perfect = hk.ok && hk.h2 === best;
  return hooks;
}

/** Lowest point the feet reach on a legal line (swing bottom or pull target). */
function lowestFeet(hk: Hook): number {
  if (hk.kind === 'pull') return hk.pos.y - HAND;
  return hk.pos.y - Math.sqrt(hk.reachSq) - HAND;
}

/** Furthest forward point (x) a legal line carries the runner before release. */
function reachForward(hk: Hook, P: V3): number {
  if (hk.kind === 'pull') return hk.pos.x;
  return P.x + 2 * (hk.pos.x - P.x);
}

export function buildCourse(level: LevelSpec): Course {
  const roofs: Roof[] = [];
  const decisions: Decision[] = [];
  const events: CourseEvent[] = [];
  let top = BASE_TOP;
  let z = 0;
  let roofIdx = 0;
  const addRoof = (a: number, b: number, t: number, zc: number, kind: Roof['kind'] = 'roof', zSpan: [number, number] = [-5, 5]): Roof => {
    const r: Roof = { id: `R${roofIdx++}`, x0: a, x1: b, z0: zc + zSpan[0], z1: zc + zSpan[1], top: t, kind };
    roofs.push(r);
    return r;
  };
  let current = addRoof(-18, 0, top, z);
  let dIndex = 0;

  for (const [gi, gap] of level.gaps.entries()) {
    if (gap.kind === 'strip') {
      // walkway with tiles 10..1 counting down to the point under the hook ("0")
      const start = current.x1;
      const foot = start + 12;
      addRoof(start, foot - 0.5, top, z, 'walkway', [-0.8, 0.8]);
      const hookPos = { x: foot, y: top + HAND + gap.b, z };
      const L2 = level.L * level.L;
      let maxN = 0;
      for (let n = 1; n <= 10; n++) if (n * n + gap.b * gap.b <= L2) maxN = n;
      const did = `D${dIndex}`;
      const rMax = Math.sqrt(maxN * maxN + gap.b * gap.b);
      const lt = Math.min(top - 1, Math.floor(hookPos.y - rMax - HAND - 0.8));
      const land = addRoof(foot + 3, foot + 3 + 20, lt, z);
      const hook: Hook = {
        id: `${did}h1`,
        num: 1,
        spec: { a: maxN, b: gap.b },
        kind: 'swing',
        pos: hookPos,
        h2: maxN * maxN,
        v2: gap.b * gap.b,
        reachSq: maxN * maxN + gap.b * gap.b,
        reaches: true,
        holds: true,
        ok: true,
        perfect: true,
      };
      const d: Decision = {
        id: did,
        index: dIndex++,
        kind: 'strip',
        P: { x: start, y: top + HAND, z },
        edge: start,
        hooks: [hook],
        canopy: { x0: start, x1: foot + 0.5, z, top: top - 3.2 },
        land,
        next: null,
        chainStep: 0,
        camYaw: 0,
        strip: { foot, top, b: gap.b, maxN },
      };
      decisions.push(d);
      events.push({ x: start, type: 'decision', decision: d, z });
      current = land;
    } else {
      const edge = current.x1;
      const steps = gap.kind === 'chain' ? gap.steps : [gap.hooks];
      let P: V3 = { x: edge + LEAP_X, y: top + HAND + LEAP_Y, z };
      const chain: Decision[] = [];
      let lowest = Infinity;
      let forward = -Infinity;
      for (const [si, specs] of steps.entries()) {
        const did = `D${dIndex}`;
        const hooks = makeHooks(level, did, specs, P);
        const legal = hooks.filter((hk) => hk.ok);
        const d: Decision = {
          id: did,
          index: dIndex++,
          kind: 'hooks',
          P: { ...P },
          edge: si === 0 ? edge : null,
          hooks,
          canopy: { x0: si === 0 ? edge : P.x - 2.5, x1: P.x + 1.5, z: P.z, top: P.y - 6.5 },
          land: current, // replaced below
          next: null,
          chainStep: si,
          camYaw: level.space ? 0.55 : 0,
        };
        if (chain.length) chain[chain.length - 1].next = d;
        chain.push(d);
        decisions.push(d);
        if (si === steps.length - 1) {
          for (const hk of legal) {
            lowest = Math.min(lowest, lowestFeet(hk));
            forward = Math.max(forward, reachForward(hk, P));
          }
          // pull hooks (legal or not) stand on posts on the landing roof: keep the roof under all of them
          for (const hk of hooks) if (hk.kind === 'pull') lowest = Math.min(lowest, hk.pos.y - 1.6);
        } else {
          // next mid-air decision point: past the furthest legal swing, a little lower
          let fx = -Infinity;
          for (const hk of legal) fx = Math.max(fx, hk.pos.x + 0.6 * Math.sqrt(hk.reachSq));
          P = { x: fx + 4, y: P.y - 1, z: P.z };
        }
      }
      const last = chain[chain.length - 1];
      const lastP = last.P;
      // space hooks carry the runner sideways: land where the best legal line points
      const best = last.hooks.find((hk) => hk.perfect) ?? last.hooks.find((hk) => hk.ok)!;
      const zShift = best.pos.z - lastP.z;
      const zLand = lastP.z + zShift * 1.7;
      const zSpan: [number, number] = zShift > 0.5 ? [-zShift * 1.7 - 4, 6] : [-5, 5];
      const lt = Math.min(top - 1, Math.floor(lowest - 0.8));
      const landX0 = last.hooks.some((hk) => hk.kind === 'pull') ? lastP.x + 2 : lastP.x + 3;
      const land = addRoof(landX0, Math.max(landX0 + 14, forward + 10), lt, zLand, 'roof', zSpan);
      for (const d of chain) d.land = land;
      events.push({ x: edge, type: 'decision', decision: chain[0], z });
      current = land;
      z = zLand;
    }
    top = current.top;
    // climb back up when the city gets too low
    if (top < MIN_TOP && gi < level.gaps.length - 1) {
      const wallX = current.x1;
      events.push({ x: wallX, type: 'climb', top: BASE_TOP, z });
      current = addRoof(wallX, wallX + 9, BASE_TOP, z);
      top = BASE_TOP;
    }
  }
  current.x1 += 10;
  const finish = { x: current.x1 - 5, y: current.top, z };
  events.push({ x: finish.x, type: 'finish', z });
  return { level, roofs, decisions, events, start: { x: -14, y: BASE_TOP, z: 0 }, finish };
}

export function levelById(id: string): LevelSpec {
  const l = LEVELS.find((v) => v.id === id);
  if (!l) throw new Error(`unknown level ${id}`);
  return l;
}
