# Assets

## Tripo models (Tripo Studio, the user's Chrome, own tab)

Five text-to-3D generations (the full budget), all with model **H3.1 – Best Quality** at 45 credits each.
The credit balance is shared with other builders working at the same time, so not every drop below belongs
to this game.

Balance before: **3940**. After my four submissions: 3670. After the hero's retopology (35) and rig (20): 3410.
At the final exports: 2555. Before generation 5: 1610; after it, plus the pigeon's retopology, rig and the unused AI animation: 1490 (balance shared).

| File | Tripo task | Prompt (abridged) | Processing | Size | SHA-256 |
|---|---|---|---|---|---|
| `public/models/hero.glb` | [e97e9263-6fa9-4761-8465-6445ca74b9c0](https://studio.tripo3d.ai/workspace/generate/e97e9263-6fa9-4761-8465-6445ca74b9c0) | "Stylized teenage parkour free-runner … curly dark hair, orange hoodie, teal cargo shorts, white high-tops, chunky brass-and-teal mechanical grapple gauntlet on the right forearm …", **T-Pose** | Tripo retopology to 18,839 tris; Tripo auto-rig (Mixamo skeleton); Tripo preset clips **idle, run, jump, fall, climb, cheer, flip** ("stay in place" on); exported GLB with skeleton and 7 clips at 1k textures (5.12 MB); then `gltf-transform optimize --texture-compress webp --texture-size 1024 --simplify false` | 1.39 MB | `669064938452342b15a0047353750c1b1bbc636b0128732f78925690ca468e43` |
| `public/models/solar-heater.glb` | [e23d5c36-c3bf-4fc8-b650-d2158c2c06fb](https://studio.tripo3d.ai/workspace/generate/e23d5c36-c3bf-4fc8-b650-d2158c2c06fb) | "Israeli rooftop solar water heater (dud shemesh): white horizontal tank on a tilted steel A-frame with two dark blue collector panels …" | Exported GLB (923k tris, 30.1 MB); `gltf-transform optimize --texture-compress webp --texture-size 1024 --simplify-ratio 0.03 --simplify-error 0.002` | 1.35 MB | `b3e1b9e98e2983e55cca4f0c6ac973123ad1211377780e85b6aa94693dd0e6b3` |
| `public/models/pigeon.glb` | [ef8bc9f1-b0a7-466f-966c-aef462960cc1](https://studio.tripo3d.ai/workspace/generate/ef8bc9f1-b0a7-466f-966c-aef462960cc1) | "Plump city rock pigeon standing, grey-blue feathers with iridescent green and purple neck … cute stylized" | Same as the heater (996k tris, 31.0 MB in) | 1.12 MB | `91e89291b7bb29be98385a75f5c6697267af73ecae9ac66716e6827dc5afba2d` |
| `public/models/pigeon-flying.glb` | [58adab8d-db97-48c4-9b1e-de30237815fb](https://studio.tripo3d.ai/workspace/generate/58adab8d-db97-48c4-9b1e-de30237815fb) | "City rock pigeon in flight, both wings fully spread out horizontally … tail fanned, legs tucked …" (generation 5, after playtest feedback that the birds didn't fly) | Tripo retopology to 7,165 tris (35); Tripo auto-rig type **Other** (20) gives wing chains `bone_8→11` and `bone_12→15`. A Tripo AI-animation attempt (20) produced a humanoid motion that doesn't drive the bird rig, so it wasn't used. Exported with skeleton, then `gltf-transform optimize --texture-compress webp --texture-size 1024 --simplify false`. **In game the shoulder and elbow bones are flapped procedurally** (`src/birds.ts`) around the body axis, with glide phases. | 0.33 MB | `b5c3dcdc62423179a3e956bb4239ed638d4085797d3a5a44d2add536412691bf` |
| `public/models/water-tank.glb` | [8599b1f3-c395-474c-bd6c-3a802ee34738](https://studio.tripo3d.ai/workspace/generate/8599b1f3-c395-474c-bd6c-3a802ee34738) | "Old Mediterranean rooftop water tank: rusty cream tank on four steel legs with a tall vintage TV antenna mast, small ladder, peeling paint" | Same as the heater (938k tris, 29.8 MB in) | 1.12 MB | `58eb20af9b81e7337f33f4e5c48db0d5bb8bc5f2bd7d6d43847ab6f8f53c60eb` |

In game, the hero plays Tripo's clips through `THREE.AnimationMixer`. While on the rope, the gauntlet arm
(Mixamo `RightArm` → `RightForeArm`) is aimed at the hook procedurally, and the body tilts along the rope.
Props are static meshes. Perched pigeons peck; when the runner comes near they swap to the rigged flying pigeon and flap away, and a few circle overhead. Colliders are simple boxes, never
the generated geometry.

Note: in the first build the exports were blocked because Chrome was hidden (Tripo builds exports in the
page), and the game showed placeholders. Exported in the rebuild once Chrome was visible.

## Gameplay mockups (ChatGPT image generation, the user's Chrome)

`design/mockups/`:

| File | Shows |
|---|---|
| `rh-v2-mockup-01-bullet-time.png` | **v2 target**: frozen mid-leap, three numbered hooks with leg tags, triangle with "?", `L = 10`, combo, stars, tap prompt |
| `rh-v2-mockup-02-wrong.png` | v2 wrong choice: rope short with "חסר 0.66 מ׳", awning bounce, greyed hook, ✕ card |
| `rh-v2-mockup-03-jump-strip.png` | v2 mobile jump strip: tiles 10→1, plumb line to 0, "↕ 12", big קפיצה! button. Its green/orange tile tint would give away the answer, so the game does **not** copy it. |
| `rh-mockup-01..04-*.png` | v1 mockups (aim, fail, mobile, results). The results-screen layout is still used. |

The mockups' Hebrew has small glyph-order errors (typical of image models). The UI copies layout and
palette, not pixels.

## Procedural (exact) geometry

Roofs (1 m tile grid shader), walkways with numbered tiles, catch canopies, banded poles (1 m bands aligned
to the grapple-hand height of each decision), cables, hooks, sign brackets drawn with their true angles,
night bulbs (one per metre along hand height and up to each hook), measurement overlay, finish arch, sky,
sea and background city. All in `src/world.ts` and `src/textures.ts`.

## Fonts and audio

Rubik 400/700/800 bundled locally via `@fontsource/rubik` 5.3.0 (SIL OFL). All sounds are synthesised
with WebAudio (`src/audio.ts`).
