# Progress: Rooftop Hypotenuse

## 2026-10-24

- Read COMMON.md, BUILD_HANDOFF.md and the design reset. The loop here is skilled traversal (run → judge → commit → swing/fall), not delivery or collection.
- Created the public repo https://github.com/AceDZN/rooftop-hypotenuse at the user's request. This folder is now its own git repository nested in idea-plotter, with commits on `main`.
- Tripo (user's Chrome): 4 generations (hero in T-pose, solar heater, pigeon, water tank). Hero retopologised to 18.8k tris and Mixamo-rigged; clips idle/run/fall applied. Export blocked once the Chrome window went hidden (see ASSETS.md).
- ChatGPT image generation (user's Chrome): 4 gameplay mockups (aim, fail, mobile swing, results) in `design/mockups/`, used as the UI target.
- Pure rules + 8 authored levels + deterministic sim. 34 unit tests, including a simulated play-through of every level and every authored line (legal lines land on their roof; wrong lines bounce on the awning and climb back in 1.5–3.4 s).
- Found and fixed a real bug through the tests: the swing's "don't drag through a roof" safety fired on the take-off plank, so swings released instantly.
- Scene, HUD, touch controls, screens and synthesized audio built and compared against the mockups in a real browser (desktop 1024×768 pane and 844×390 phone landscape).
- Fixed in-browser: TDZ crashes in the world builder, hidden explanation card, camera staring up at 24 m hooks, mirrored sign text, bidi flipping of formulas inside Hebrew notes, awning shot blocked by poles.

## Next

1. With Chrome visible: re-apply the jump/climb/cheer clips, export the hero GLB (skeleton + clips) and the 3 props, optimise to ≤ 3 MB each, put them in `public/models/`, record hashes in ASSETS.md.
2. Tune medal thresholds with real players (current gold ≈ 1.5–2× the scripted best route).
3. Human playtest for feel: swing speed (`TUNE.swingGravity`, `swingKick`, `reelFraction`) and camera.
