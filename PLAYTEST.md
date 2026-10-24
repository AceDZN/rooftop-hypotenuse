# Playtest log

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
