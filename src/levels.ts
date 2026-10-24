// Authored levels. Pure data plus small helpers; no Three.js.
// World axes: +X is "forward" along each course, +Y is up, Z is sideways. One rooftop tile = 1 m.
// Anchor offsets are measured from the grapple hand, which is 1 m above the take-off mark.

import type { Offset3 } from './rules.ts';

export const HAND_HEIGHT = 1;

export interface Box {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** bottom (0 for buildings standing on the street) */
  y0: number;
  /** walkable top */
  top: number;
  kind: 'roof' | 'plank' | 'walkway';
  /** facade colour family for buildings */
  tint?: number;
}

export interface Mark {
  id: string;
  x: number;
  z: number;
  /** walkable surface height at the mark */
  top: number;
  /** horizontal unit direction the plank points (toward the gap) */
  dir: { x: number; z: number };
  /** radius in which the mark is the active one / fire snaps onto it */
  snap: number;
  label?: string;
  /** awning that catches a miss from this mark */
  awning: string;
}

export interface Awning {
  id: string;
  /** centre of the canopy */
  x: number;
  z: number;
  top: number;
  /** half extents along `dir` and across it */
  halfLen: number;
  halfWide: number;
  dir: { x: number; z: number };
  /** climb straight up to the plank above (scaffold walkway) instead of the wall */
  straightUp?: boolean;
}

export type AnchorKind = 'swing' | 'pull' | 'bracket';

export interface Frame {
  /** post (vertical leg), beam (horizontal leg), brace (the long side) */
  post: number;
  beam: number;
  brace: number;
}

export interface AnchorDef {
  id: string;
  mark: string;
  /** horizontal leg in metres (exact, authored) */
  a: number;
  /** vertical leg in metres, up positive (exact, authored) */
  b: number;
  /** unit horizontal direction from the hand toward the anchor */
  dir: { x: number; z: number };
  /** exact x and z legs for space problems; when present a² = x² + z² */
  xz?: { x: number; z: number };
  kind: AnchorKind;
  /** roof the player is guided onto after a successful line */
  land: string;
  /** wall-bracket triangle (converse level). Only a right triangle holds. */
  frame?: Frame;
  /** extra flavour for the result recap */
  note?: string;
}

export interface Level {
  id: string;
  num: number;
  title: string;
  subtitle: string;
  goal: string;
  L: number;
  boxes: Box[];
  marks: Mark[];
  awnings: Awning[];
  anchors: AnchorDef[];
  start: { x: number; z: number; yaw: number };
  finish: { x: number; z: number; box: string };
  night: boolean;
  hints: boolean;
  scanLabels: boolean;
  /** seconds; gold also requires zero falls (and goldMark when present) */
  medal: { gold: number; silver: number };
  goldMark?: string;
  /** optional ground grid for the courtyard (space) level */
  courtyard?: { x0: number; x1: number; z0: number; z1: number };
  lesson: string;
}

const FWD = { x: 1, z: 0 };
const DIAG = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

function roof(id: string, x0: number, x1: number, z0: number, z1: number, top: number, tint = 0): Box {
  return { id, x0, x1, z0, z1, y0: 0, top, kind: 'roof', tint };
}

/** A 1.2 m wide steel plank cantilevered from a roof edge out to just past the mark. */
function plank(id: string, fromX: number, markX: number, z: number, top: number): Box {
  return { id, x0: fromX - 0.2, x1: markX + 0.45, z0: z - 0.6, z1: z + 0.6, y0: top - 0.25, top, kind: 'plank' };
}

function mark(id: string, x: number, z: number, top: number, awning: string, dir = FWD, snap = 0.9, label?: string): Mark {
  return { id, x, z, top, dir, snap, awning, label };
}

/** Striped awning hanging 3.2 m under a roof edge at `edgeX`, sticking out 3.6 m over the gap. */
function awning(id: string, edgeX: number, z: number, roofTop: number, len = 3.6, wide = 2.8): Awning {
  return { id, x: edgeX + len / 2, z, top: roofTop - 3.2, halfLen: len / 2, halfWide: wide, dir: FWD };
}

// Directions for anchors that are not straight ahead. Decisions never use these (see `legs`).
const AHEAD = { x: 1, z: 0 };
const d345 = (side: 1 | -1) => ({ x: 0.8, z: side * 0.6 });
const d435 = (side: 1 | -1) => ({ x: 0.6, z: side * 0.8 });
type Extra = Partial<Pick<AnchorDef, 'frame' | 'note' | 'xz'>>;
function anc(id: string, markId: string, a: number, b: number, dir: { x: number; z: number }, kind: AnchorKind, land: string, extra: Extra = {}): AnchorDef {
  return { id, mark: markId, a, b, dir, kind, land, ...extra };
}
/** Space anchor with exact x, z legs. */
function anc3(id: string, markId: string, x: number, z: number, b: number, land: string, note?: string): AnchorDef {
  const a = Math.hypot(x, z);
  return { id, mark: markId, a, b, dir: { x: x / a, z: z / a }, xz: { x, z }, kind: 'swing', land, note };
}

export const LEVELS: Level[] = [
  {
    id: 'L1',
    num: 1,
    title: 'קו ראשון',
    subtitle: 'החבל באורך 5 מ׳. איזה וו באמת בטווח?',
    goal: 'רוצו לקרש, כוונו לוו ושגרו. הסריקה מראה רק כמה רחוק לרוחב וכמה גבוה.',
    L: 5,
    boxes: [
      roof('R0', -22, -9, -5, 5, 15, 0),
      roof('R1', -7, -1.5, -5, 5, 15, 1),
      plank('P1', -1.5, 0, 0, 15),
      roof('R2', 4, 24, -7, 7, 11, 2),
    ],
    marks: [mark('M1', 0, 0, 15, 'W1')],
    awnings: [awning('W1', -1.5, 0, 15)],
    anchors: [
      anc('A', 'M1', 3, 4, AHEAD, 'swing', 'R2'),
      anc('B', 'M1', 4, 4, d345(1), 'swing', 'R2', { note: 'נראה קרוב, אבל 4² + 4² = 32 > 25' }),
    ],
    start: { x: -19, z: 0, yaw: 0 },
    finish: { x: 21, z: 0, box: 'R2' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 9, silver: 14 },
    lesson: 'הישר מהיד אל הוו הוא היתר: 3² + 4² = 9 + 16 = 25 = 5². בדיוק באורך החבל, ולכן מגיע.',
  },
  {
    id: 'L2',
    num: 2,
    title: 'בחרו את הרחוק',
    subtitle: 'L = 10. שלושה ווים, שניים בטווח. הרחוק חוסך זמן.',
    goal: 'הנפה מהוו הרחוק ביותר שעדיין בטווח זורקת אתכם הכי קרוב לדגל.',
    L: 10,
    boxes: [roof('R0', -16, -1.5, -6, 6, 24, 3), plank('P1', -1.5, 0, 0, 24), roof('R1', 3, 30, -11, 13, 15, 4)],
    marks: [mark('M1', 0, 0, 24, 'W1')],
    awnings: [awning('W1', -1.5, 0, 24)],
    anchors: [
      anc('A', 'M1', 6, 8, d345(-1), 'swing', 'R1'),
      anc('B', 'M1', 8, 7, AHEAD, 'swing', 'R1'),
      anc('C', 'M1', 9, 3, d345(1), 'swing', 'R1', { note: 'הרחוק ביותר שעדיין בטווח' }),
    ],
    start: { x: -12, z: 0, yaw: 0 },
    finish: { x: 26, z: 6, box: 'R1' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 8, silver: 13 },
    lesson: '6² + 8² = 100 ≤ 100, ו־9² + 3² = 90 ≤ 100. אבל 8² + 7² = 113 > 100: חסר קצת יותר מחצי מטר.',
  },
  {
    id: 'L3',
    num: 3,
    title: 'מאיפה לקפוץ',
    subtitle: 'הוו 12 מ׳ מעל היד, L = 13. על הפיגום מסומנים מרחקים 1 עד 10.',
    goal: 'עמדו על מספר ושגרו. כמה רחוק אפשר לעמוד? הקפיצה הרחוקה ביותר נותנת את ההנפה המהירה ביותר.',
    L: 13,
    boxes: [
      roof('R0', -24, -12, -6, 6, 20, 5),
      { id: 'WK', x0: -12.2, x1: 0.45, z0: -0.8, z1: 0.8, y0: 19.7, top: 20, kind: 'walkway' },
      roof('R1', 4, 26, -8, 8, 17, 6),
    ],
    marks: Array.from({ length: 10 }, (_, i) => mark(`T${i + 1}`, 1 - (i + 1), 0, 20, 'W1', FWD, 0.5, String(i + 1))),
    awnings: [{ id: 'W1', x: -5, z: 0, top: 16.8, halfLen: 7.6, halfWide: 2.6, dir: FWD, straightUp: true }],
    anchors: Array.from({ length: 10 }, (_, i) => anc(`H${i + 1}`, `T${i + 1}`, i + 1, 12, AHEAD, 'swing', 'R1')),
    start: { x: -20, z: 0, yaw: 0 },
    finish: { x: 23, z: 0, box: 'R1' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 10, silver: 15 },
    goldMark: 'T5',
    lesson: 'מוצאים ניצב: √(13² − 12²) = √(169 − 144) = √25 = 5. מסימן 5 החבל בדיוק מגיע ונותן את הקשת הגדולה ביותר.',
  },
  {
    id: 'L4',
    num: 4,
    title: 'שרשרת שלשות',
    subtitle: 'שדרוג: חבל 17 מ׳. שלוש קפיצות ברצף.',
    goal: 'שלשות פיתגוריות: 8-15-17, 9-12-15, 5-12-13. זהו אותן מהר.',
    L: 17,
    boxes: [
      roof('R0', -16, -1.5, -6, 6, 40, 7),
      plank('P1', -1.5, 0, 0, 40),
      roof('R1', 6, 19.5, -7, 7, 36, 8),
      plank('P2', 19.5, 21, 0, 36),
      roof('R2', 25, 41.5, -8, 8, 31, 9),
      plank('P3', 41.5, 43, 0, 31),
      roof('R3', 46, 68, -10, 15, 21, 10),
    ],
    marks: [mark('M1', 0, 0, 40, 'W1'), mark('M2', 21, 0, 36, 'W2'), mark('M3', 43, 0, 31, 'W3')],
    awnings: [awning('W1', -1.5, 0, 40), awning('W2', 19.5, 0, 36), awning('W3', 41.5, 0, 31)],
    anchors: [
      anc('A1', 'M1', 8, 15, AHEAD, 'swing', 'R1'),
      anc('D1', 'M1', 10, 14, d345(1), 'swing', 'R1', { note: '10² + 14² = 296 > 289' }),
      anc('A2', 'M2', 9, 12, AHEAD, 'swing', 'R2', { note: '3-4-5 כפול 3' }),
      anc('D2', 'M2', 11, 13, d345(-1), 'swing', 'R2', { note: '11² + 13² = 290: חסר 3 ס״מ בלבד' }),
      anc('A3', 'M3', 5, 12, AHEAD, 'swing', 'R3'),
      anc('A3b', 'M3', 12, 5, d345(1), 'swing', 'R3', { note: 'אותה שלשה, הניצבים התחלפו' }),
    ],
    start: { x: -12, z: 0, yaw: 0 },
    finish: { x: 64, z: 4, box: 'R3' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 15, silver: 22 },
    lesson: 'שלשות פיתגוריות חוזרות: 8-15-17, ‏9-12-15 (זה 3-4-5 כפול 3), ‏5-12-13. מי שמזהה אותן לא צריך מחשבון.',
  },
  {
    id: 'L5',
    num: 5,
    title: 'גלישה למטה',
    subtitle: 'L = 13. הווים מתחתיכם. החבל מושך אתכם ישר אליהם.',
    goal: 'גם כשהוו נמוך, הגובה נכנס בריבוע: (−5)² = 25. הסימן לא משנה.',
    L: 13,
    boxes: [
      roof('R0', -16, -1.5, -6, 6, 30, 11),
      plank('P1', -1.5, 0, 0, 30),
      roof('R1', 2, 28.5, -11, 11, 18, 12),
      plank('P2', 28.5, 30, 0, 18),
      roof('R2', 34, 54, -10, 12, 7, 13),
    ],
    marks: [mark('M1', 0, 0, 30, 'W1'), mark('M2', 30, 0, 18, 'W2')],
    awnings: [awning('W1', -1.5, 0, 30, 3.2), awning('W2', 28.5, 0, 18, 3.2)],
    anchors: [
      anc('A', 'M1', 12, -5, AHEAD, 'pull', 'R1', { note: 'הרחוק: 12² + (−5)² = 169' }),
      anc('D', 'M1', 9, -10, d435(-1), 'pull', 'R1', { note: '9² + (−10)² = 181 > 169' }),
      anc('C', 'M1', 5, -12, d435(1), 'pull', 'R1'),
      anc('E', 'M2', 6, -11, AHEAD, 'pull', 'R2'),
      anc('F', 'M2', 11, -7, d345(1), 'pull', 'R2', { note: '11² + (−7)² = 170 > 169: חסר 4 ס״מ' }),
      anc('G', 'M2', 8, -9, d345(-1), 'pull', 'R2'),
    ],
    start: { x: -12, z: 0, yaw: 0 },
    finish: { x: 50, z: 0, box: 'R2' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 12, silver: 19 },
    lesson: 'מרחק הוא תמיד חיובי: a² + b² לא משתנה אם b שלילי. 12² + (−5)² = 144 + 25 = 169 = 13².',
  },
  {
    id: 'L6',
    num: 6,
    title: 'החצר (פיתגורס במרחב)',
    subtitle: 'L = 26. הוו מעל החצר: 6 מ׳ בציר x, ‏8 מ׳ בציר z, ‏24 מ׳ למעלה.',
    goal: 'פעמיים פיתגורס: קודם האלכסון על הרצפה, אחר כך האלכסון באוויר.',
    L: 26,
    boxes: [
      { ...roof('R0', -14, -1.5, -14, -1.5, 20, 14) },
      { id: 'P1', x0: -1.9, x1: 0.45, z0: -1.9, z1: 0.45, y0: 19.75, top: 20, kind: 'plank' },
      roof('RL', -14, -3, 3, 13, 13, 15),
      roof('RF', 3, 13, -14, -3, 11, 16),
      roof('R1', 9, 32, 13, 34, 16, 17),
    ],
    marks: [mark('M1', 0, 0, 20, 'W1', DIAG)],
    awnings: [{ id: 'W1', x: 1.2, z: 1.2, top: 16.8, halfLen: 2.6, halfWide: 3, dir: DIAG }],
    anchors: [
      anc3('A', 'M1', 6, 8, 24, 'R1'),
      anc3('D', 'M1', 8, 8, 24, 'R1', '8² + 8² + 24² = 704 > 676'),
    ],
    start: { x: -10, z: -10, yaw: Math.PI / 4 },
    finish: { x: 27, z: 29, box: 'R1' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 10, silver: 16 },
    courtyard: { x0: -1.5, x1: 9, z0: -1.5, z1: 13 },
    lesson: 'על הרצפה: 6² + 8² = 100, כלומר 10 מ׳. באוויר: 10² + 24² = 676 = 26². בקיצור: x² + z² + y² = 36 + 64 + 576.',
  },
  {
    id: 'L7',
    num: 7,
    title: 'השלט העקום',
    subtitle: 'L = 15. הווים תלויים על זרועות שלטים. רק זרוע עם זווית ישרה מחזיקה.',
    goal: 'המשפט ההפוך: אם 6² + 8² = 10², הזווית ישרה. אם לא, הזרוע תתפרק.',
    L: 15,
    boxes: [
      roof('R0', -16, -1.5, -6, 6, 26, 18),
      plank('P1', -1.5, 0, 0, 26),
      roof('WALL1', -4, 26, 8, 16, 46, 19),
      roof('R1', 6, 28.5, -8, 7.5, 22, 20),
      plank('P2', 28.5, 30, 0, 22),
      roof('WALL2', 28, 60, 12, 20, 40, 21),
      roof('R2', 36, 56, -9, 11.5, 16, 22),
    ],
    marks: [mark('M1', 0, 0, 26, 'W1'), mark('M2', 30, 0, 22, 'W2')],
    awnings: [awning('W1', -1.5, 0, 26), awning('W2', 28.5, 0, 22)],
    anchors: [
      anc('A', 'M1', 6, 8, AHEAD, 'bracket', 'R1', { frame: { post: 6, beam: 8, brace: 10 } }),
      anc('B', 'M1', 11, 5, AHEAD, 'bracket', 'R1', { frame: { post: 6, beam: 8, brace: 11 }, note: '6² + 8² = 100 ≠ 121 = 11²' }),
      anc('C', 'M2', 8, 6, AHEAD, 'bracket', 'R2', { frame: { post: 9, beam: 12, brace: 16 }, note: '9² + 12² = 225 ≠ 256 = 16²' }),
      anc('E', 'M2', 12, 5, AHEAD, 'bracket', 'R2', { frame: { post: 9, beam: 12, brace: 15 } }),
    ],
    start: { x: -12, z: 0, yaw: 0 },
    finish: { x: 52, z: 0, box: 'R2' },
    night: false,
    hints: true,
    scanLabels: true,
    medal: { gold: 12, silver: 19 },
    lesson: 'המשפט ההפוך: אם a² + b² = c² המשולש ישר־זווית. 6² + 8² = 100 = 10² ✓, ‏9² + 12² = 225 = 15² ✓. ‏11 ו־16 לא.',
  },
  {
    id: 'L8',
    num: 8,
    title: 'ריצת לילה',
    subtitle: 'L = 15. בלי רמזים ובלי מספרים. ספרו את הנורות: כל נורה מטר.',
    goal: 'מבחן העברה: גג אחר, לילה, רק הנורות והאריחים. שני ווים מתוך שלושה בטווח.',
    L: 15,
    boxes: [
      roof('R0', -16, -1.5, -6, 6, 30, 23),
      plank('P1', -1.5, 0, 0, 30),
      roof('R1', 6, 29.5, -8, 8, 23, 24),
      plank('P2', 29.5, 31, 0, 23),
      roof('R2', 34, 54, -9, 13, 20, 25),
    ],
    marks: [mark('M1', 0, 0, 30, 'W1'), mark('M2', 31, 0, 23, 'W2')],
    awnings: [awning('W1', -1.5, 0, 30), awning('W2', 29.5, 0, 23)],
    anchors: [
      anc('A', 'M1', 9, 12, AHEAD, 'swing', 'R1'),
      anc('B', 'M1', 10, 11, AHEAD, 'swing', 'R1', { note: '100 + 121 = 221 ≤ 225' }),
      anc('C', 'M1', 12, 10, AHEAD, 'swing', 'R1', { note: '144 + 100 = 244 > 225' }),
      anc3('E', 'M2', 5, 0, 12, 'R2'),
      anc3('F', 'M2', 8, 6, 12, 'R2', '64 + 36 + 144 = 244 > 225'),
    ],
    start: { x: -12, z: 0, yaw: 0 },
    finish: { x: 50, z: 2, box: 'R2' },
    night: true,
    hints: false,
    scanLabels: false,
    medal: { gold: 12, silver: 19 },
    lesson: 'בלי מספרים על המסך: ספרתם 9 ו־12 (225), 10 ו־11 (221), ו־12 ו־10 (244 > 225).',
  },
];

export function levelById(id: string): Level {
  const l = LEVELS.find((v) => v.id === id);
  if (!l) throw new Error(`unknown level ${id}`);
  return l;
}

export function markById(level: Level, id: string): Mark {
  const m = level.marks.find((v) => v.id === id);
  if (!m) throw new Error(`unknown mark ${id}`);
  return m;
}

export function boxById(level: Level, id: string): Box {
  const b = level.boxes.find((v) => v.id === id);
  if (!b) throw new Error(`unknown box ${id}`);
  return b;
}

export function handOf(m: Mark): { x: number; y: number; z: number } {
  return { x: m.x, y: m.top + HAND_HEIGHT, z: m.z };
}

/** Offset from the hand to the hook, for rendering and motion (not for decisions). */
export function anchorOffset(a: AnchorDef): Offset3 {
  if (a.xz) return { x: a.xz.x, y: a.b, z: a.xz.z };
  return { x: a.a * a.dir.x, y: a.b, z: a.a * a.dir.z };
}

/** Exact squared legs used for every reach decision: horizontal² and vertical². */
export function legsSq(a: AnchorDef): { h2: number; v2: number } {
  const h2 = a.xz ? a.xz.x * a.xz.x + a.xz.z * a.xz.z : a.a * a.a;
  return { h2, v2: a.b * a.b };
}

export function anchorReachSq(a: AnchorDef): number {
  const { h2, v2 } = legsSq(a);
  return h2 + v2;
}

export function anchorReachable(level: Level, a: AnchorDef): boolean {
  return anchorReachSq(a) <= level.L * level.L;
}

/** A bracket only holds when its frame is a right triangle (converse of Pythagoras). */
export function anchorHolds(a: AnchorDef): boolean {
  if (!a.frame) return true;
  const { post, beam, brace } = a.frame;
  return post * post + beam * beam === brace * brace;
}

/** World position of an anchor's hook. */
export function anchorWorld(level: Level, a: AnchorDef): { x: number; y: number; z: number } {
  const h = handOf(markById(level, a.mark));
  const o = anchorOffset(a);
  return { x: h.x + o.x, y: h.y + o.y, z: h.z + o.z };
}

export function anchorsOfMark(level: Level, markId: string): AnchorDef[] {
  return level.anchors.filter((a) => a.mark === markId);
}
