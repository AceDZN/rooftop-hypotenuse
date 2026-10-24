# Assets

## Tripo models (Tripo Studio in the user's Chrome, own tab)

Four text-to-3D generations of the five allowed, all with model **H3.1 – Best Quality**, 45 credits each.
The credit balance is shared with two other builders working at the same time, so drops below
can't all be attributed to this game.

Balance before: **3940**. After my four submissions: 3670. Retopology and rig made it 3410. Later readings were 3165, 3060, 2945 and 2630, with the other builders also spending.

| # | Asset | Task | Prompt (abridged) | Status |
|---|---|---|---|---|
| 1 | Runner hero (T-pose) | [e97e9263-6fa9-4761-8465-6445ca74b9c0](https://studio.tripo3d.ai/workspace/generate/e97e9263-6fa9-4761-8465-6445ca74b9c0) | "Stylized teenage parkour free-runner … curly dark hair, orange hoodie, teal cargo shorts, white high-tops, chunky brass-and-teal mechanical grapple gauntlet on the right forearm … single character, no base", **T-Pose on** | Generated (994k tris). Retopologised in Tripo to **18,839 tris** (35 credits), auto-rigged with the **Mixamo** skeleton (20 credits). Tripo preset clips applied: **idle, run, fall** finished. **jump, climb, cheer** were queued but did not finish (see below). **Not yet exported.** |
| 2 | Solar water heater (דוד שמש) | [e23d5c36-c3bf-4fc8-b650-d2158c2c06fb](https://studio.tripo3d.ai/workspace/generate/e23d5c36-c3bf-4fc8-b650-d2158c2c06fb) | "Israeli rooftop solar water heater (dud shemesh): white horizontal cylindrical tank on a tilted steel A-frame with two dark blue glass collector panels … stylized hand-painted game prop" | Generated. **Not yet exported.** |
| 3 | Pigeon | [ef8bc9f1-b0a7-466f-966c-aef462960cc1](https://studio.tripo3d.ai/workspace/generate/ef8bc9f1-b0a7-466f-966c-aef462960cc1) | "Plump city rock pigeon standing, grey-blue feathers with iridescent green and purple neck … cute stylized" | Generated. **Not yet exported.** |
| 4 | Water tank + TV antenna | [8599b1f3-c395-474c-bd6c-3a802ee34738](https://studio.tripo3d.ai/workspace/generate/8599b1f3-c395-474c-bd6c-3a802ee34738) | "Old Mediterranean rooftop water tank: rusty cream cylindrical tank on four short steel legs with a tall vintage TV antenna mast … small ladder, peeling paint" | Generated (938k tris). **Not yet exported.** |

**Why the GLBs aren't in `public/models/` yet.** Partway through, the user's Chrome window became hidden
(`document.visibilityState === 'hidden'` in both of my tabs; screenshots failed; the frontmost app was Finder).
Tripo's animation retargeting and its Export step run in the page and stalled while the window was hidden.
An export with the 3 finished clips was triggered but no file arrived in `~/Downloads`. I did not try
workarounds against Tripo's authenticated API.

**What the game does meanwhile.** `src/main.ts` loads `public/models/hero.glb`, `solar-heater.glb`,
`water-tank.glb` and `pigeon.glb`. Until they exist it uses procedural stand-ins (`src/fallbacks.ts`, plus the
limb-animated runner in `src/hero.ts`). `render_game_to_text().assets` reports which files loaded.

**To finish** (with Chrome visible): export each model as GLB from Tripo (hero with *Export Skeleton* on and
all clips selected), then optimise and drop in:

```bash
npx @gltf-transform/cli optimize ~/Downloads/<hero>.glb public/models/hero.glb --texture-compress webp
npx @gltf-transform/cli optimize ~/Downloads/<prop>.glb public/models/solar-heater.glb --texture-compress webp --simplify-ratio 0.03
```

Target ≤ 3 MB each. Then record the SHA-256 and the processing here. The loader has the meshopt decoder enabled.

## Gameplay mockups (ChatGPT image generation, user's Chrome)

Generated in one ChatGPT conversation as the UI/UX target for the build, saved in `design/mockups/`:

| File | Shows |
|---|---|
| `rh-mockup-01-aim.png` | Aim moment: runner on the plank, hooks on a cable between banded poles, in-world triangle (3 מ׳ / 4 מ׳ / "?"), scan card with the rope bar, timer, level chip, ריכוז arc, pause/sound/hint |
| `rh-mockup-02-fail.png` | Miss: rope stops short with an orange "חסר 0.66 מ׳" pill, runner bouncing on the striped awning, the ✕ explanation card |
| `rh-mockup-03-mobile-swing.png` | Mobile landscape mid-swing: green ✓ toast, joystick, שיגור חבל / קפיצה / ריכוז buttons, the סיום arch |
| `rh-mockup-04-results.png` | Level complete: green ribbon title, medal, stats, the lines you chose (✓/✗ rows), the lesson tip, buttons, the 8-level chain |

The mockups' Hebrew text has small glyph-order errors (typical of image models). The UI copies their layout
and palette, not their pixels.

## Procedural (exact) geometry

Rooftops, parapets, planks, the scaffold walkway, awnings, banded poles (1 m bands aligned to the take-off
hand height), cables, hooks, wall brackets (drawn with their true side lengths, so a crooked bracket really is
not square), the measurement overlay, night bulbs (one per metre), the finish arch, sky, sea and the
background city. All are generated in `src/world.ts` and `src/textures.ts`.

## Fonts and audio

- Rubik (400/700/800) bundled locally via `@fontsource/rubik` 5.3.0 (SIL OFL).
- All sound is synthesised at runtime with WebAudio (`src/audio.ts`), with no audio files.
