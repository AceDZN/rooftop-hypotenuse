# Playtest log

## v1 (24 Oct 2026): rejected by the user; replanned as v2 (see `design/REDESIGN.md`)

**User verdict after playing:** no 3D models visible, "barely understood what to do", "boring", "too hard,
not because of the math but the game flow and controls".

### What automation verified in v1 (still true, but not evidence of fun)

- 34 unit tests pass: exact reach rules; every handoff number; every authored line in all 8 levels simulated (legal lines land on their roof, wrong lines bounce on the awning and climb back in 1.5–3.4 s); determinism; focus at 15%.
- Real browser (built-in pane, desktop 1024×768, plus a phone landscape at 844×390 with `?touch=1`): all 8 levels reach the results screen via the in-page autoplayer, with no new console errors.
- Headless Chromium (Metal) via `npm run shots`: 12 screenshots in `screenshots/`, no console errors.
- `npm run build`: JS 740 kB (197 kB gzip), dist 1.2 MB without models. FPS was not measured in a real foreground window (the headless/hidden runs don't give honest numbers).

### What was not verified / was wrong

- Tripo models are not in the game (exports blocked while Chrome was hidden). Procedural stand-ins were shown instead.
- Fun, clarity and learning: the user's play says no. The design had too few decisions per minute and too many control skills (move, orbit, aim, walk to the plank) before each decision.
- The phone miss shot puts the camera inside a building.
