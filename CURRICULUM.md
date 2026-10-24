# Curriculum map: קו היתר (Rooftop Hypotenuse)

Source of truth: Workbook, grade 8 (כיתה ח׳). Module routes come from the saved index
`reports/math-games-2026-10-24/curriculum/math-grade-8-index.json` (chapters 8 and 9) and the saved
module snapshots `pythagoras-concept-proof.json` and `pythagoras-3d-box.json`. No route here is invented.

Chapter 9: **פרק 9: משפט פיתגורס במישור ובמרחב, גליל**. Chapter 8: **פרק 8: שורש ריבועי ומספר אי-רציונאלי**.

## What the game makes the player decide

Every grapple is a right-triangle decision. The scan shows only the two legs (↔ across, ↕ up or down),
never the straight line. The rope has a fixed length L. The rule in code (`src/rules.ts`,
`src/levels.ts`) compares squares exactly: the line holds iff `a² + b² ≤ L²`; in space
`x² + z² + y² ≤ L²`. A wrong decision is not a popup: the rope visibly stops short ("חסר 0.66 מ׳"),
the runner bounces on a striped awning, climbs back in about 2.5 s, and a card shows the worked
comparison (e.g. `4² + 4² = 32`, `32 > 25 = 5²`).

## Level by level

| Level | What happens | Skill practiced | Workbook module |
|---|---|---|---|
| 1 · קו ראשון | L = 5. Hook A (3, 4) reaches exactly; decoy B (4, 4) looks close but is 5.66. | Hypotenuse from two legs; the hypotenuse is the longest side; exact triple 3-4-5. | [משפט פיתגורס והוכחה חזותית](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-concept-proof), [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse) |
| 2 · בחרו את הרחוק | L = 10. (6, 8) = 10 ✓, (8, 7) = 10.63 ✗, (9, 3) ≈ 9.49 ✓. The farthest legal hook is fastest. | Computing and comparing hypotenuses; deciding ≤ without a calculator; non-integer results. | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse), [אומדן שורשים](https://math.workbook.co.il/grade-8/chapter-8/square-root-estimation) |
| 3 · מאיפה לקפוץ | Hook 12 m above the hand, L = 13, numbered take-off marks 1–10. Marks 1–5 hold, 6–10 fall short; gold needs mark 5. | Finding a leg: √(13² − 12²) = 5. The best take-off is exactly the computed leg. | [חישוב ניצב](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-leg), [שורשים כהכנה לפיתגורס](https://math.workbook.co.il/grade-8/chapter-8/roots-for-pythagoras) |
| 4 · שרשרת שלשות | L = 17, three jumps: 8-15-17, 9-12-15 (3-4-5 × 3), 5-12-13 or 12-5-13; decoys 10-14 (17.2) and 11-13 (17.03, short by 3 cm). | Recognising Pythagorean triples and multiples of 3-4-5; swapping legs gives the same hypotenuse. | [שלשות פיתגוריות](https://math.workbook.co.il/grade-8/chapter-9/pythagorean-triples) |
| 5 · גלישה למטה | L = 13, hooks below the hand; the rope pulls the runner down to them. (12, −5) ✓, (5, −12) ✓, (9, −10) ✗, (6, −11) ✓, (8, −9) ✓, (11, −7) ✗ by 4 cm. | Distance is positive: (−5)² = 25, so the sign of the vertical leg never matters. | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse), [משפט פיתגורס והוכחה חזותית](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-concept-proof) |
| 6 · החצר (פיתגורס במרחב) | L = 26. Hook at x = 6, z = 8, y = 24: √(36 + 64 + 576) = 26 ✓. Decoy x = 8, z = 8 is 26.53 ✗. The overlay draws the floor triangle, then the vertical one. | Pythagoras in space, two steps (box diagonal). | [פיתגורס במרחב ותיבה](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-3d-box) |
| 7 · השלט העקום | L = 15. Both hooks on each roof are in reach; only wall brackets whose sides satisfy p² + q² = r² hold (6-8-10 ✓, 6-8-11 ✗, 9-12-15 ✓, 9-12-16 ✗). A crooked bracket is drawn with its true geometry and breaks under load. | The converse of Pythagoras: deciding whether an angle is right from three side lengths. | [המשפט ההפוך](https://math.workbook.co.il/grade-8/chapter-9/converse-pythagoras) |
| 8 · ריצת לילה (transfer) | L = 15 at night on a different layout, **no hints and no numbers**: count string-light bulbs (one per metre) and roof tiles. (9, 12) ✓, (10, 11) ✓ 14.87, (12, 10) ✗ 15.62; then a space hook x 5, z 0, y 12 = 13 ✓ with decoy x 8, z 6, y 12 ✗. | Transfer: reading the legs from the world itself, then applying the theorem with no scaffold. | [חישוב היתר](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-find-hypotenuse), [פיתגורס במרחב ותיבה](https://math.workbook.co.il/grade-8/chapter-9/pythagoras-3d-box), [אומדן שורשים](https://math.workbook.co.il/grade-8/chapter-8/square-root-estimation) |

Levels 1, 2, 3, 6 and 8 use exactly the numbers in `handoffs/math-2026-10-24/rooftop-hypotenuse/BUILD_HANDOFF.md`.
Additions beyond the handoff, each marked as such in `src/levels.ts` and checked by tests:

- Level 4 adds a second decoy (11, 13), which misses by 3 cm, and an alternative legal hook (12, 5) at the last jump.
- Level 5 values are authored here because the handoff left them open.
- Level 7 adds a second roof (9-12-15 vs 9-12-16).
- Level 8 adds a space decoy (8, 6, 12).

## Hebrew terms used in the UI

יתר, ניצב, משפט פיתגורס, המשפט ההפוך, זווית ישרה, שורש, מטר (מ׳). Numbers and formulas are rendered in
LTR isolates (`<bdi dir="ltr">`) inside the RTL interface.

## Supports and logging

- **Scan card**: legs only (↔/↕, or x/z/↕ in space) plus rope length L. Never the straight distance.
- **Hint** (optional, H or the 💡 button): fills in `a² + b² = ?` and `L² = …` with the numbers, never the answer. Every use is logged; hints are disabled on level 8.
- **Focus** (Shift / right-click / ריכוז): 15% slow motion with a limited meter, and draws the triangle.
- **Learning log** (local only): every fire (level, anchor, a, b, outcome), miss/collapse, hint, finish time and falls, kept in `localStorage` key `rh:log` (last 500 events). Nothing leaves the device.
