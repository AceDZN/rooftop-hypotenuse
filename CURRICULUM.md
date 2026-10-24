# Curriculum map: קו היתר (Rooftop Hypotenuse), v2

Source of truth: Workbook, grade 8 (כיתה ח׳). Routes come from the saved index
`reports/math-games-2026-10-24/curriculum/math-grade-8-index.json` (chapters 8 and 9) and the module snapshots
`pythagoras-concept-proof.json` and `pythagoras-3d-box.json`. No route is invented.

- **פרק 9:** משפט פיתגורס במישור ובמרחב, גליל
- **פרק 8:** שורש ריבועי ומספר אי-רציונאלי

## The decision the game forces

Every gap freezes time and shows 2–3 hooks. Each tag shows only the legs (↔ across, ↕ up/down; in space
x, z, ↕), never the straight distance. The rope has length L. The code (`src/levels.ts`, `src/rules.ts`)
compares squares exactly: a hook holds iff `a² + b² ≤ L²` (space: `x² + z² + y² ≤ L²`; brackets also need
`p² + q² = r²`). A wrong tap isn't a popup: the rope visibly stops short, you bounce back to the same moment,
that hook greys out, and a card shows the comparison. The ⭐ goes to the farthest hook that still reaches,
so kids must compare sums, not just test one.

## Level by level

| Level | Twist | Numbers (✓ reaches, ✗ doesn't) | Skill | Workbook module |
|---|---|---|---|---|
| 1 · קו ראשון | 6 gaps, two hooks each, L = 5 | (3,4) ✓ vs (4,4) ✗ 5.66; (4,3) ✓ vs (5,2) ✗; (2,4) ✓ vs (3,5) ✗; (4,2) ✓ vs (4,4) ✗; (3,4) and (4,3) both ✓; (3,3) ✓ vs (4,4) ✗ | Hypotenuse from two legs; the hypotenuse is the longest side; 3-4-5 | [משפט פיתגורס והוכחה חזותית](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-concept-proof), [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse) |
| 2 · בחרו את הרחוק | 7 gaps, three hooks, L = 10 | (6,8) ✓, (8,7) ✗ 10.63, (9,3) ✓ 9.49 ⭐; …(9,4) ✓, (10,3) ✗, (7,7) ✓ 9.9 | Comparing a² + b² with L² without square roots; non-integer results | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse), [אומדן שורשים](https://math.workbook.co.il/grade-8/chapter-8/square-root-estimation) |
| 3 · מאיפה לקפוץ | **Jump strip**: numbered tiles 10→1 to the point under the hook, L = 13 | b = 12 → legal tiles ≤ 5 (⭐ at 5); b = 10 → ≤ 8; b = 11 → ≤ 6. Plus hook gaps (5,12) ✓ vs (10,9) ✗, (12,5) ✓ vs (11,7) ✗ 13.04 | Finding a leg: √(L² − b²) | [חישוב ניצב](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-leg), [שורשים כהכנה לפיתגורס](https://math.workbook.co.il/grade-8/chapter-8/roots-for-pythagoras) |
| 4 · שרשרת שלשות | **Mid-air chains**: the next hooks appear while flying, L = 17 | (8,15) ✓ vs (10,14) ✗ 17.2; (9,12) ✓ vs (11,13) ✗ 17.03; (5,12), (12,5) ✓ vs (16,6) ✗; (12,12) ✓ 16.97 (just!) | Pythagorean triples, multiples of 3-4-5, swapped legs | [שלשות פיתגוריות](https://math.workbook.co.il/grade-8/chapter-9/pythagorean-triples) |
| 5 · גלישה למטה | Hooks below: the rope pulls you down, L = 13 | (12,−5) ✓ ⭐, (5,−12) ✓, (9,−10) ✗; (11,−7) ✗ by 4 cm; (12,5) up vs (12,−5) down, same distance | (−5)² = 25: the sign never matters | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse) |
| 6 · החצר | **3D**: the camera tilts to show depth; tags show x, z, ↕; the overlay draws the floor triangle, then the vertical one. L = 26 | (x6, z8, ↕24) ✓ = 26 vs (x8, z8, ↕24) ✗ 26.53; (12,9,20) ✓ vs (12,12,20) ✗; … | Pythagoras in space (box diagonal), two steps | [פיתגורס במרחב ותיבה](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-3d-box) |
| 7 · הזרוע העקומה | Both hooks reach; only right-angled sign brackets hold (crooked frames are drawn with their true angles and break) | 6-8-10 ✓ vs 6-8-11 ✗; 9-12-15 ✓ vs 9-12-16 ✗; 5-12-13 ✓ vs 5-12-14 ✗; 8-15-17 ✓ vs 8-15-18 ✗; 7-24-25 and 20-21-29 both ✓ | The converse of Pythagoras | [המשפט ההפוך](https://math.workbook.co.il/grade-8/chapter-9/converse-pythagoras) |
| 8 · ריצת לילה | **Transfer**: night, no numbers, no hints. Count bulbs (1 per metre along hand height and up to each hook). L = 15 | (9,12) ✓, (10,11) ✓ 14.87, (12,10) ✗ 15.62; (x5, z0, ↕12) ✓ 13 vs (x8, z6, ↕12) ✗; … | Reading the legs from the world, then the theorem with no scaffold | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse), [פיתגורס במרחב ותיבה](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-3d-box) |

All the numbers from `handoffs/math-2026-10-24/rooftop-hypotenuse/BUILD_HANDOFF.md` appear and are checked
in `tests/levels.test.ts`. v2 adds more gaps per level so each level has 4–7 decisions instead of 1–3.

## Supports and logging

- Hook tags: legs only. The hovered hook (desktop) gets a bold triangle with leg labels and a "?" hypotenuse.
- Hint (💡 / H, optional): adds `a² + b² = ?` to each tag. Every use is logged. Hints are disabled on level 8.
- No timer while deciding: the world waits.
- Local learning log (`localStorage` key `rh2:log`, last 500 events): every fire (level, decision, hook, a, b, outcome), misses and collapses, hints, finish. Nothing leaves the device.

Hebrew terms used: יתר, ניצב, משפט פיתגורס, המשפט ההפוך, זווית ישרה, שורש. Formulas render in LTR isolates
inside the RTL UI.
