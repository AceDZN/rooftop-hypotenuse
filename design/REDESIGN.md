# Rooftop Hypotenuse v2: replan

24 Oct 2026, after the user played v1: "I barely understood what to do… boring… too hard because of the
game flow and controls" and no Tripo models were visible.

## Why v1 failed

| Problem | Cause in v1 |
|---|---|
| Didn't know what to do | Free third-person running, camera orbit, hover-to-aim and "walk to the orange plank" are four skills before the first decision. |
| Boring | 1–3 decisions per level, each preceded by walking and standing still. The math moment is a pause, not a moment of play. |
| Hard for the wrong reasons | Aiming at hooks in 3D perspective, camera fighting the player, and the plank snap distance. |
| Looked cheap | The Tripo exports never landed (Chrome hidden), so a capsule and boxes stood in. The behind-the-back camera also hides the triangle that the whole game is about. |

## v2 in one sentence

A one-tap **side-view swing runner** (Stickman Hook × Ghostrunner bullet time): the runner sprints on their
own; at every gap time slows down, 2–3 hooks light up with their legs drawn as a right triangle, and you
tap the hook you think the rope reaches. Right → big swing and speed boost. Wrong → the rope stops short and
you bounce off an awning and try again.

## The 60-second loop

1. Auto-run across a white Bauhaus roof. Pigeons scatter, laundry flaps. The camera is side-on and slightly above, with deep 3D parallax over Tel Aviv and the sea.
2. At the edge of a gap, **bullet time**: the world slows to 10%. Each hook shows a tag `↔ 6 · ↕ 8`, and the triangle (horizontal leg, vertical leg, dashed "?" hypotenuse) is drawn from the gauntlet. The gauntlet shows `L = 10`.
3. **Tap a hook.** There's no clock while you think. Bullet time waits for you.
4. **Right:** THWIP, rope snaps taut, pendulum swing, auto-release at the sweet spot (tap again early for a style flip), land, combo +1 and the runner gets faster. Choosing the farthest hook still in reach gives a ⭐ ("perfect line").
5. **Wrong:** the rope stops short with a "חסר 0.66 מ׳" tag, the runner flops onto a striped awning, it bounces them back up to the edge (about 1.5 s), and a small card shows `4² + 4² = 32 > 25`. That hook greys out and you choose again. The combo resets; no lives are lost.

About 8–12 gaps per level (60–90 s), so 8–12 math decisions per minute instead of 1–3.

## Controls

- **Mobile:** tap a hook. That's it. (On jump strips: tap anywhere to jump.)
- **Desktop:** click a hook or press 1 / 2 / 3. Space on jump strips.
- No walking, no camera control, no aiming in perspective. Hooks are big, with large hit areas.

## Levels (a new twist each, the same numbers from the handoff)

| # | Twist | Handoff numbers kept |
|---|---|---|
| 1 | Two hooks, one reaches. Ghost-hand tutorial on the first gap. | L 5: (3, 4) ✓ vs (4, 4) ✗ |
| 2 | Three hooks: the farthest that reaches is ⭐. | L 10: (6, 8) ✓, (8, 7) ✗, (9, 3) ✓ |
| 3 | **Jump strip**: sprint along numbered tiles 10 → 1 toward the edge and tap JUMP when the number is small enough. Exactly 5 is ⭐ (fastest swing). Timing + finding a leg. | hook 12 up, L 13 → ≤ 5 |
| 4 | **Air chains**: the next hooks appear while you're still flying; choose mid-air. | L 17: 8-15-17, 9-12-15, 5-12-13, decoy 10-14 |
| 5 | Hooks below: zip down. | (12, −5), (5, −12), (11, −7) ✗ … |
| 6 | **Courtyard**: the camera swings to a 3/4 view; tags show `x 6 · z 8 · ↕ 24`. | (6, 8, 24) ✓ vs (8, 8, 24) ✗, L 26 |
| 7 | **Sign brackets**: both in reach, only the right-angled frame holds. | 6-8-10 ✓ vs 6-8-11 ✗ |
| 8 | **Night**: no numbers, count the bulbs (1 per metre). | L 15: (9, 12), (10, 11) ✓, (12, 10) ✗, (5, 0, 12) |

## Looks

The Tripo hero (rigged run, jump, fall, climb, cheer) and props, exported properly this time. Chunky
glowing hooks on red-white banded poles. A huge readable triangle overlay. Speed lines, a combo meter, ⭐
pops. Warm sunset palette from the v1 mockups.

## What survives from v1

`rules.ts` (squared comparisons), the pendulum physics (moved into the side plane), awning bounce, audio,
the HUD style, results screen and tests approach. The level files and controls are rewritten.

## Alternative considered

A behind-the-back auto-runner (Subway Surfers style) keeps the third-person 3D feel, but the triangle reads
badly in perspective, which is the same problem v1 had. Side-view keeps the math legible and still feels 3D
through depth, parallax and camera swoops.
