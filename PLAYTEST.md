# Playtest log

## v2.1 (25 Oct 2026): fixes from the user's play

| Feedback | Fix |
|---|---|
| Runner ran in place, and nothing said to tap to start | The intro card had no styles and was invisible. It's now a real overlay (button, "tap anywhere / Enter"), and the runner idles until play starts. |
| The first option was (almost) always correct | Rebalanced every level: tall, close decoys fail and far hooks win. A new test checks that hook 1 is wrong in ≥ 30% of decisions per level, and that the ⭐ hook is sometimes first, sometimes middle, sometimes last. |
| After a fall the runner came back sideways | The runner now always faces the hooks while deciding and bouncing, and freezes on the airborne frame of the jump clip, not the crouch. |
| Triangles hard to see on later levels and on mobile | A dark outline under every line, with thickness scaled to camera distance (capped). The leg labels stay on the hovered hook. |
| Birds jittered with closed wings | A new Tripo flying pigeon (wings spread), rigged in Tripo. Wing bones flap in code with glide phases. Perched pigeons take off as flyers and come back; a small flock circles overhead. |
| Finish ribbon faced the viewer, then had a post in front of it | The arch spans the running line and the banner faces the runner. On the final stretch the camera swings behind the runner, so the gate reads like a finish line. |
| Night level was confusing | Removed the bulbs on poles and cables. Now: one white ruler at hand height (1 bulb per metre, every 5th big) and one column per hook in that hook's badge colour, plus faint triangles and a coach bubble explaining it. Dimmer windows, fewer stars. |
| Modes should be more intuitive | Coach bubble the first time each level's twist appears. Strip: it waits, you tap the tile to jump from (or press jump to time it), with a live triangle from the hovered tile. Brackets: tags say "✓ in reach" plus the frame's sides, so the question is the right angle. Hook badges are colour-coded. |

Verified after these fixes:
- `npm test`: 34 passing.
- Browser screenshots: night, strip waiting, finish chase cam, brackets, intro card, a flying-pigeon close-up across frames, and the phone 3D view.

Not verified: real phones, real kids.


## v2 (24 Oct 2026): one-tap side-view swing runner

### Verified by automation

- **Tests: 33 passing** (`npm test`).
  - Exact rules and every handoff number with the right verdict.
  - L3 strips' largest legal tiles are 5, 8, 6.
  - L7 bracket verdicts; every hook decision has a legal hook.
  - For all 8 levels:
    - **Best play** finishes with 3 stars and the runner's feet never pass inside a roof at any simulated step.
    - **Wrong-first play** (tap every wrong hook, and jump one tile too far on strips) still finishes. Each miss bounces back to the same decision, and the miss count equals the number of wrong choices.
  - Bullet time doesn't advance the run timer. Determinism.
- **Real browser** (built-in pane, desktop): all 8 levels reach the results screen via the in-page autoplayer through the real frame loop, both best (3 stars each) and wrong-first (1 star, recovers every time).
  - Screenshots checked for:
    - a decision (tags, triangle, "L = 10")
    - a swing (Tripo hero on the rope, ✓ toast, ⭐ pop)
    - a miss ("חסר 0.66 מ׳", greyed hook, ✕ card)
    - the strip
    - the courtyard 3D view
    - brackets
    - night
    - downswing
    - results
  - FPS measured in real time: **120** at 879×819, DPR 2 (this Mac). Not measured on a phone.
- **Phone layout** (844×390 with `?touch=1`): title, decision, strip and miss screenshots checked.
- **Headless Chromium** (`npm run shots`): 13 screenshots in `screenshots/`, all 4 Tripo models report loaded, no console errors.
- **Build**: JS 727 kB (193 kB gzip); about 6.2 MB total with the four models.

### Not verified (needs kids)

- Whether it's fun, whether the pacing (about 20 s of running plus untimed decisions per level) is right, and whether kids learn. Automation can't tell.
- Real touch on a real phone (tap targets were sized generously, and tested only with mouse events plus emulation).
- How hard L4's chains and L6's 3D reading are for grade-8 students.

### Fixed during v2 testing

- Swinging from a jump-strip tile passed through the walkway planks. The runner now leaps off the end while the rope flies; the rule is still judged from the tile.
- Tags for hooks 1 m apart overlapped, so tags are spread on screen. Tall 3D hooks pushed tags under the HUD, fixed with framing margins and a 3/4 camera. The x/z tag order was scrambled by bidi. Bracket frames were cut off by the framing.

## v1 (24 Oct 2026): rejected by the user, replaced by v2

The user's verdict after playing: no 3D models visible, "barely understood what to do", "boring", "too hard
because of the flow and controls". v1 had free third-person running, camera orbit, hover-aiming and
walk-to-the-plank before each of only 1–3 decisions per level, and the Tripo exports were blocked by a
hidden Chrome window. See `design/REDESIGN.md`.
