# קו היתר · Rooftop Hypotenuse

A 3D grapple-parkour game over sunset Tel Aviv rooftops for Hebrew-speaking grade-8 students
(Israeli curriculum, Workbook chapter 9: משפט פיתגורס).

Your grapple rope has a fixed length **L**. The scanner shows only how far **across** (↔) and how far
**up or down** (↕) a hook is, never the straight distance. If `a² + b² ≤ L²` the rope catches and you
swing in a big pendulum arc (or zip down to a hook below). If not, the rope stops short by a visible
amount, you bounce on a striped awning a floor below, climb back in about 2.5 s, and a card shows the
comparison. Medals reward fast, correct decisions. Standing still to think is never punished; only the
medal timer runs.

Eight levels: hypotenuse, picking the farthest legal hook, finding a leg (where to jump from), Pythagorean
triples, hooks below you (the sign doesn't matter), Pythagoras in space (a courtyard), the converse (only
right-angled sign brackets hold), and a night transfer level with no numbers: count the light bulbs.

## Run

```bash
npm install
npm run dev      # http://localhost:5178
npm test         # rules, level numbers, and simulated play-through of every level
npm run build    # static build in dist/ (relative base, works offline)
npm run shots    # headless Chromium screenshots into screenshots/ (needs the dev server)
```

## Controls

| | Desktop | Touch |
|---|---|---|
| Run | WASD / arrows (camera-relative) | Left joystick |
| Jump | Space | קפיצה |
| Aim | Move the mouse over a hook · Q / Tab cycles | Tap a hook |
| Fire the grapple | Click or E (within 7 m of the orange take-off mark you dash onto it) | שיגור חבל |
| Let go early while swinging | Space / click | Tap anywhere or שיגור חבל |
| Focus (15% slow motion + triangle) | Hold Shift or right mouse button | Hold ריכוז |
| Hint (a² + b² = ? with numbers) | H or 💡 | 💡 |
| Orbit camera | Drag | Drag on the scene |
| Pause / restart / mute | Esc or P / R / M | Buttons |

## Code map

- `src/rules.ts`: pure reach math (squared comparisons, find-a-leg, converse). No Three.js.
- `src/levels.ts`: the 8 authored levels as data (exact integer legs; directions only for rendering).
- `src/sim.ts`: deterministic simulation: running, jumping, take-off marks, rope flight, custom pendulum swing (inextensible rope, reel-in that conserves angular momentum, landing assist), pull-down for hooks below, miss → awning bounce → climb, focus, medals, local learning log.
- `src/autoplay.ts`: scripted player used by tests and the browser hook.
- `src/world.ts`, `src/textures.ts`: the scene (sky, sea, city, gridded roofs, planks, awnings, banded poles, brackets, props).
- `src/hero.ts`: the Tripo-rigged runner (clips plus arm aimed at the hook), with a procedural stand-in.
- `src/overlay.ts`: the in-world triangle, labels, reticle and "short by" tag.
- `src/main.ts`: renderer, camera rig, input, HUD, screens, sounds and test hooks.
- `design/mockups/`: ChatGPT gameplay mockups the UI was built against.

Test hooks: `window.render_game_to_text()` (level, player position/velocity/state, L, every anchor's
a, b, x, z, reach, reachable, targeted, focus, timer, falls, last outcome with `short_by_m`, assets) and a
deterministic `window.advanceTime(ms)`.

See `progress.md`, `PLAYTEST.md`, `CURRICULUM.md` and `ASSETS.md`.
