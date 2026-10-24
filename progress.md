# Progress: Rooftop Hypotenuse

## 24 Oct 2026

### v1 (morning)

- Third-person free-run grapple game: rules, 8 levels, sim, scene, HUD, 4 ChatGPT mockups.
- Public repo https://github.com/AceDZN/rooftop-hypotenuse (this folder is its own git repo nested in idea-plotter; commits on `main`).
- Tripo: 4 generations (hero in T-pose, solar heater, pigeon, water tank); hero retopologised and rigged.
- Rejected by the user in play (confusing, boring, controls; models missing because Chrome was hidden during export).

### v2 (afternoon)

- Replan in `design/REDESIGN.md`. Three new ChatGPT mockups (bullet-time decision, wrong choice, phone jump strip).
- Tripo: re-applied the jump/climb/cheer clips and added flip; exported the hero (skeleton + 7 clips) and all 3 props; optimised to 1.1–1.4 MB each; in `public/models/`.
- Rebuilt as a one-tap side-view swing runner:
  - New level specs and course builder.
  - New deterministic sim.
  - Side camera that frames each decision.
  - Hook tags, combo and stars HUD.
  - Jump strip, mid-air chains, 3D courtyard, brackets, night bulbs.
- 33 tests, browser verification, headless screenshots, docs.

### v2.1 (25 Oct)

- Fixed the user's playtest notes (see PLAYTEST.md v2.1). Tripo generation 5: a rigged flying pigeon with wing bones flapped in code.

## Next

1. Put it in front of grade-8 kids: watch the first gap (do they understand "tap the hook"?), the strip timing, and L4/L6 difficulty.
2. If the hero reads too small in wide decision shots, try a closer camera or a portrait layout for phones.
3. Optional: deploy the static `dist/` (the user mentioned Vercel). Not done.
