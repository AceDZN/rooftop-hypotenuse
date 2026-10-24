// v2 scene builder: a side-view Tel Aviv rooftop course built from the pure Course data.
// Math-critical pieces (roof edges, hooks, poles with 1 m bands, brackets, canopies) are exact
// procedural geometry; Tripo models dress the roofs.
import * as THREE from 'three';
import { HAND, type Course, type Decision, type Hook } from './levels.ts';
import type { Sim } from './sim.ts';
import { Birds, type FlyerSource } from './birds.ts';
import { bandTexture, clothTexture, facadeGlow, facadeTexture, labelTexture, rustTexture, signTexture, stripeTexture } from './textures.ts';

export interface PropAssets {
  heater?: THREE.Object3D;
  tank?: THREE.Object3D;
  pigeon?: THREE.Object3D;
  /** Tripo flying pigeon (wings spread), optionally with a flap clip */
  flyer?: FlyerSource;
}

export interface HookView {
  hook: Hook;
  decision: Decision;
  pos: THREE.Vector3;
  ring: THREE.Mesh;
  group: THREE.Group;
  /** bracket frame member midpoints for the side-length labels */
  members?: { mid: THREE.Vector3; text: string }[];
}

export interface World {
  root: THREE.Group;
  hooks: Map<string, HookView>;
  update(dt: number, t: number, sim: Sim, playerPos: THREE.Vector3): void;
  bounceCanopy(decisionId: string): void;
  scatterPigeons(near: THREE.Vector3): void;
  dispose(): void;
}

export const HOOK_COLORS = [0xff8a2a, 0x2fd0e0, 0xff5fa8];
const TINTS = [0xfff7ea, 0xf3ecdf, 0xfbefd9, 0xeef0ea, 0xf6e6d6, 0xf1f1ee, 0xf8e9e0];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Facade texture on walls by world position (4 m × 3 m bays), roof tiles with a 1 m grid on tops. */
function buildingMaterial(map: THREE.Texture, night: boolean, roofColor: number, glow?: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.92, metalness: 0 });
  if (glow) {
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = glow;
    m.emissiveIntensity = 0.55;
  }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRoof = { value: new THREE.Color(roofColor) };
    sh.uniforms.uLine = { value: new THREE.Color(night ? 0x3b4466 : 0x9c7f5f) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWNrm = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        #else
          vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
          vWNrm = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWPos = wp4.xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform vec3 uRoof;\nuniform vec3 uLine;')
      .replace(
        '#include <map_fragment>',
        `
        vec2 fuv = abs(vWNrm.x) > 0.5 ? vec2(vWPos.z / 4.0, vWPos.y / 3.0) : vec2(vWPos.x / 4.0, vWPos.y / 3.0);
        if (vWNrm.y > 0.5) {
          vec2 g = abs(fract(vWPos.xz + 0.5) - 0.5) / (fwidth(vWPos.xz) * 1.4);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          vec3 tile = uRoof * (0.96 + 0.04 * sin(floor(vWPos.x) * 12.9 + floor(vWPos.z) * 78.2));
          diffuseColor.rgb *= mix(tile, uLine, line * 0.55);
        } else {
          diffuseColor *= texture2D(map, fuv);
        }
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
          if (vWNrm.y < 0.5) totalEmissiveRadiance *= texture2D(emissiveMap, fuv).rgb; else totalEmissiveRadiance *= 0.0;
        #endif`,
      );
  };
  return m;
}

function skyMaterial(night: boolean, sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(night ? 0x0b1430 : 0x3a8a9e) },
      uMid: { value: new THREE.Color(night ? 0x1d2c5a : 0xf3a06a) },
      uBot: { value: new THREE.Color(night ? 0x2b3570 : 0xffcf8f) },
      uSun: { value: sunDir.clone().normalize() },
      uSunCol: { value: new THREE.Color(night ? 0xe8eeff : 0xfff1c8) },
      uNight: { value: night ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uBot, uSun, uSunCol; uniform float uNight; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 c = mix(uBot, uMid, smoothstep(-0.05, 0.12, h));
        c = mix(c, uTop, smoothstep(0.08, 0.55, h));
        float d = max(dot(vDir, uSun), 0.0);
        c += uSunCol * (pow(d, 700.0) * 2.5 + pow(d, 20.0) * 0.35 * (1.0 - uNight) + pow(d, 4.0) * 0.12);
        if (uNight > 0.5) {
          vec2 sp = floor(vDir.xz / (vDir.y + 0.3) * 260.0);
          c += vec3(step(0.9985, hash(sp)) * smoothstep(0.15, 0.5, h)) * 0.6;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function buildWorld(course: Course, assets: PropAssets): World {
  const level = course.level;
  const night = level.night;
  const root = new THREE.Group();
  const rand = seeded(level.num * 977 + 13);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // ---------- sky, sea, light (the sun sets behind the city, over the sea) ----------
  const sunDir = night ? new THREE.Vector3(-0.3, 0.5, -1) : new THREE.Vector3(-0.25, 0.1, -1);
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 32, 16)), track(skyMaterial(night, sunDir)));
  sky.renderOrder = -10;
  root.add(sky);
  const midX = (course.roofs[0].x0 + course.roofs[course.roofs.length - 1].x1) / 2;
  const sea = new THREE.Mesh(track(new THREE.PlaneGeometry(3000, 1200)), track(new THREE.MeshStandardMaterial({ color: night ? 0x18264a : 0x2f8ea0, roughness: 0.2, metalness: 0.4 })));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(midX, 0.2, -700);
  root.add(sea);
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(1600, 260)), track(new THREE.MeshStandardMaterial({ color: night ? 0x2a2e44 : 0xc9b79c, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(midX, 0, -40);
  ground.receiveShadow = true;
  root.add(ground);

  const hemi = new THREE.HemisphereLight(night ? 0x5a6db0 : 0xffe9d2, night ? 0x22223a : 0xd9a27a, night ? 0.9 : 1.5);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(night ? 0xbcc8ff : 0xffbf86, night ? 0.8 : 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  // warm fill from the camera side so the runner's face isn't in silhouette
  const fill = new THREE.DirectionalLight(night ? 0x8090c0 : 0xfff0dc, night ? 0.5 : 1.1);
  fill.position.set(10, 30, 60);
  root.add(fill);

  // ---------- materials ----------
  const facades = [0, 1, 2, 3, 4, 5].map((i) => track(facadeTexture(i, night)));
  const glowTex = night ? facades.map((_, i) => track(facadeGlow(i))) : [];
  const roofCol = night ? 0x9a9cb6 : 0xf3e6cc;
  const mats = TINTS.map((tint, i) => {
    const m = buildingMaterial(facades[i % facades.length], night, roofCol, night ? glowTex[i % glowTex.length] : undefined);
    m.color.setHex(night ? 0xb7bbd6 : tint);
    return track(m);
  });
  const bandTex = track(bandTexture(night));
  const steelMat = track(new THREE.MeshStandardMaterial({ map: track(rustTexture()), roughness: 0.7, metalness: 0.35 }));
  const whiteMat = track(new THREE.MeshStandardMaterial({ color: night ? 0xc4c7dd : 0xfbf6ec, roughness: 0.85 }));
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 }));
  const hookMat = track(new THREE.MeshStandardMaterial({ color: 0xffb13b, emissive: 0xff7a10, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.4 }));
  const usedMat = track(new THREE.MeshStandardMaterial({ color: 0x8a8f94, emissive: 0x111111, roughness: 0.6, metalness: 0.4 }));
  const cableMat = track(new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.6 }));
  const bulbMat = track(new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd36a, emissiveIntensity: 3.5 }));
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const cylGeo = track(new THREE.CylinderGeometry(1, 1, 1, 12, 1));

  function boxMesh(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, shadow = true, parent: THREE.Object3D = root): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D = root): THREE.Mesh {
    const m = new THREE.Mesh(cylGeo, mat);
    const d = new THREE.Vector3().subVectors(b, a);
    m.scale.set(r, d.length(), r);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function groundAt(x: number, z: number): number {
    let t = 0;
    for (const r of course.roofs) if (r.kind === 'roof' && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) t = Math.max(t, r.top);
    return t;
  }

  const bulbGeo = track(new THREE.SphereGeometry(0.13, 10, 8));
  const bulbs: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const bulb = (x: number, y: number, z: number, color = 0xfff1c0, size = 1) =>
    bulbs.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(size, size, size)), c: new THREE.Color(color) });

  /** Pole with 1 m red/white bands aligned to a reference height (the grapple hand), so you can count. */
  function bandedPole(x: number, z: number, y0: number, y1: number, refY: number, r = 0.17): void {
    const t = bandTex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, (y1 - y0) / 2);
    t.offset.set(0, ((((y0 - refY) / 2) % 1) + 1) % 1);
    track(t);
    const m = new THREE.Mesh(cylGeo, track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })));
    m.scale.set(r, y1 - y0, r);
    m.position.set(x, (y0 + y1) / 2, z);
    m.castShadow = true;
    root.add(m);
  }

  // ---------- buildings ----------
  const balconyGeo = track(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 20, 1, false, 0, Math.PI));
  const railGeo = track(new THREE.CylinderGeometry(1.45, 1.45, 0.9, 20, 1, true, 0, Math.PI));
  const railMat = track(new THREE.MeshStandardMaterial({ color: night ? 0xaab0cc : 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
  for (const [i, r] of course.roofs.entries()) {
    if (r.kind === 'walkway') {
      boxMesh(steelMat, r.x0, r.x1, r.top - 0.3, r.top, r.z0, r.z1);
      for (let x = Math.ceil(r.x0); x <= r.x1; x += 2) {
        for (const z of [r.z0, r.z1]) rod(new THREE.Vector3(x, r.top - 9, z), new THREE.Vector3(x, r.top + 1, z), 0.05, darkMetal);
      }
      rod(new THREE.Vector3(r.x0, r.top + 1, r.z0), new THREE.Vector3(r.x1, r.top + 1, r.z0), 0.04, darkMetal);
      continue;
    }
    boxMesh(mats[i % mats.length], r.x0, r.x1, 0, r.top, r.z0, r.z1);
    // back parapet only: the front stays open so the runner's feet are never hidden
    boxMesh(whiteMat, r.x0, r.x1, r.top, r.top + 0.45, r.z0, r.z0 + 0.25);
    addBalconies(r.x0, r.x1, r.z1, r.top);
  }

  function addBalconies(x0: number, x1: number, z: number, top: number): void {
    for (let y = top - 4.5; y > 3; y -= 3) {
      for (let x = x0 + 2.5; x < x1 - 2.5; x += 6 + Math.floor(rand() * 3)) {
        if (rand() < 0.4) continue;
        const slab = new THREE.Mesh(balconyGeo, whiteMat);
        slab.position.set(x, y, z);
        slab.rotation.y = -Math.PI / 2;
        slab.castShadow = true;
        root.add(slab);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(x, y + 0.5, z);
        rail.rotation.y = -Math.PI / 2;
        root.add(rail);
      }
    }
  }

  // ---------- canopies (the trampoline awnings that catch a wrong line) ----------
  const stripes = track(stripeTexture());
  stripes.repeat.set(2, 1);
  const awningMat = track(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85, side: THREE.DoubleSide }));
  const canopyViews = new Map<string, { g: THREE.Group; wobble: number }>();
  for (const d of course.decisions) {
    const c = d.canopy;
    const g = new THREE.Group();
    const w = c.x1 - c.x0;
    g.position.set((c.x0 + c.x1) / 2, c.top, c.z);
    const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(w, 4.2, 6, 2)), awningMat);
    cloth.rotation.x = -Math.PI / 2;
    cloth.rotation.y = -0.08;
    cloth.castShadow = true;
    g.add(cloth);
    const val = new THREE.Mesh(track(new THREE.PlaneGeometry(w, 0.45)), awningMat);
    val.position.set(0, -0.35, 2.1);
    g.add(val);
    root.add(g);
    // two poles down to whatever is below
    for (const sx of [c.x0 + 0.2, c.x1 - 0.2]) {
      const base = groundAt(sx, c.z + 1.8);
      if (c.top - base > 0.5) rod(new THREE.Vector3(sx, base, c.z + 1.8), new THREE.Vector3(sx, c.top, c.z + 1.8), 0.05, darkMetal);
    }
    canopyViews.set(d.id, { g, wobble: 0 });
  }

  // ---------- hooks ----------
  const hooks = new Map<string, HookView>();
  const ringGeo = track(new THREE.TorusGeometry(0.32, 0.085, 10, 26));
  const hookGeo = track(new THREE.TorusGeometry(0.19, 0.06, 8, 16, Math.PI * 1.3));
  const signWords = ['פלאפל', 'גלידה', 'מיץ טבעי', 'ספרים', 'בורקס'];
  let signIdx = 0;
  for (const d of course.decisions) {
    const refY = d.P.y;
    // cables: one per distinct hook depth, strung between two banded poles behind the swing plane
    const byZ = new Map<number, Hook[]>();
    for (const hk of d.hooks) if (hk.kind === 'swing') byZ.set(hk.pos.z, [...(byZ.get(hk.pos.z) ?? []), hk]);
    for (const [hz, list] of byZ) {
      const cz = hz - 1.4;
      const xs = list.map((hk) => hk.pos.x);
      const x0 = Math.min(...xs) - 2.5;
      const x1 = Math.max(...xs) + 2.5;
      const cy = Math.max(...list.map((hk) => hk.pos.y)) + 2.4;
      for (const px of [x0, x1]) bandedPole(px, cz, groundAt(px, cz), cy + 0.4, refY);
      rod(new THREE.Vector3(x0, cy, cz), new THREE.Vector3(x1, cy, cz), 0.035, cableMat);
      for (const hk of list) {
        rod(new THREE.Vector3(hk.pos.x, cy, cz), new THREE.Vector3(hk.pos.x, hk.pos.y + 0.45, hk.pos.z), 0.03, cableMat);
      }
    }
    if (night && d.kind === 'hooks') {
      // the only lights that matter: a warm ruler at hand height (one bulb per metre, every 5th big)
      // and one column per hook in that hook's colour, from the ruler up to the hook
      const far = Math.max(...d.hooks.map((hk) => hk.pos.x));
      for (let k = 1; d.P.x + k <= far + 0.01; k++) bulb(d.P.x + k, refY, d.P.z, 0xfff1c0, k % 5 === 0 ? 1.7 : 1);
      rod(new THREE.Vector3(d.P.x, refY + 0.12, d.P.z), new THREE.Vector3(far, refY + 0.12, d.P.z), 0.012, cableMat);
      for (const hk of d.hooks) {
        const col = HOOK_COLORS[(hk.num - 1) % HOOK_COLORS.length];
        const up = Math.sign(hk.pos.y - refY);
        const n = Math.round(Math.abs(hk.pos.y - refY));
        for (let k = 1; k < n; k++) bulb(hk.pos.x, refY + up * k, hk.pos.z, col, k % 5 === 0 ? 1.7 : 1);
        rod(new THREE.Vector3(hk.pos.x, refY, hk.pos.z - 0.05), new THREE.Vector3(hk.pos.x, hk.pos.y - 0.3 * up, hk.pos.z - 0.05), 0.012, cableMat);
      }
    }
    for (const hk of d.hooks) {
      const pos = new THREE.Vector3(hk.pos.x, hk.pos.y, hk.pos.z);
      const group = new THREE.Group();
      root.add(group);
      const ring = new THREE.Mesh(ringGeo, hookMat);
      ring.position.copy(pos);
      group.add(ring);
      const hookMesh = new THREE.Mesh(hookGeo, hookMat);
      hookMesh.position.copy(pos).add(new THREE.Vector3(0, -0.45, 0));
      hookMesh.rotation.z = Math.PI * 0.85;
      group.add(hookMesh);
      const view: HookView = { hook: hk, decision: d, pos, ring, group };
      if (hk.kind === 'pull') {
        const base = groundAt(hk.pos.x, hk.pos.z);
        bandedPole(hk.pos.x, hk.pos.z - 0.3, base, hk.pos.y - 0.3, refY, 0.13);
      } else if (hk.kind === 'bracket' && hk.spec.frame) {
        // frame drawn at a fixed size (beam 4.5 m) with its true angles: only 3 lengths that satisfy
        // p² + q² = r² close into a right angle
        const { post, beam, brace } = hk.spec.frame;
        const s = 4.5 / beam;
        const dy = (brace * brace - post * post - beam * beam) / (2 * post);
        const dx = Math.sqrt(Math.max(0, beam * beam - dy * dy));
        const fz = hk.pos.z - 1.6;
        const T = new THREE.Vector3(hk.pos.x, hk.pos.y + 0.6, fz);
        const Pt = new THREE.Vector3(T.x + dx * s, T.y - dy * s, fz);
        const Qt = new THREE.Vector3(Pt.x, Pt.y - post * s, fz);
        const bracket = new THREE.Group();
        bracket.position.copy(Pt);
        group.add(bracket);
        const loc = (p: THREE.Vector3) => p.clone().sub(Pt);
        const ok = dy === 0;
        const beamMat = track(new THREE.MeshStandardMaterial({ color: ok ? 0x2f6f6a : 0x8a4a32, roughness: 0.55, metalness: 0.4 }));
        rod(loc(Pt), loc(T), 0.13, beamMat, bracket);
        rod(loc(Pt), loc(Qt), 0.13, beamMat, bracket);
        rod(loc(Qt), loc(T), 0.1, beamMat, bracket);
        rod(loc(T), loc(new THREE.Vector3(hk.pos.x, T.y, hk.pos.z)), 0.06, darkMetal, bracket);
        // the support pole the bracket is bolted to
        const base = groundAt(Pt.x, fz);
        rod(new THREE.Vector3(Pt.x, base, fz - 0.25), new THREE.Vector3(Pt.x, Pt.y + 0.6, fz - 0.25), 0.2, darkMetal);
        const sign = new THREE.Mesh(
          track(new THREE.PlaneGeometry(3.6, 1.6)),
          track(new THREE.MeshStandardMaterial({ map: track(signTexture(signWords[signIdx++ % signWords.length], ok ? '#1f6f68' : '#b2462e', '#fff3dc')), side: THREE.DoubleSide, roughness: 0.7 })),
        );
        sign.position.copy(loc(new THREE.Vector3(Pt.x - 1.9, Qt.y - 1.1, fz - 0.05)));
        bracket.add(sign);
        group.remove(ring, hookMesh);
        ring.position.copy(loc(pos));
        hookMesh.position.copy(loc(pos)).add(new THREE.Vector3(0, -0.55, 0));
        bracket.add(ring, hookMesh);
        view.group = bracket;
        view.members = [
          { mid: Pt.clone().lerp(Qt, 0.5), text: String(post) },
          { mid: Pt.clone().lerp(T, 0.5), text: String(beam) },
          { mid: Qt.clone().lerp(T, 0.5), text: String(brace) },
        ];
      }
      hooks.set(hk.id, view);
    }
    // jump strip: numbered tiles 10..1, a plumb line from the hook down to "0"
    if (d.kind === 'strip' && d.strip) {
      const s = d.strip;
      for (let n = 1; n <= 10; n++) {
        const tile = new THREE.Mesh(
          track(new THREE.PlaneGeometry(0.92, 1.4)),
          track(new THREE.MeshBasicMaterial({ map: track(labelTexture(String(n), { bg: n % 2 ? '#d9783b' : '#c96a30', fg: '#fff6e6', w: 128, h: 196 })) })),
        );
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(s.foot - n, s.top + 0.02, d.P.z);
        root.add(tile);
        // upright plate on the front edge so the number reads from the side camera
        const plate = new THREE.Mesh(
          track(new THREE.PlaneGeometry(0.86, 0.62)),
          track(new THREE.MeshBasicMaterial({ map: track(labelTexture(String(n), { bg: '#fbf3e2', fg: '#b4521f', w: 128, h: 92 })) })),
        );
        plate.position.set(s.foot - n, s.top - 0.42, d.P.z + 0.86);
        root.add(plate);
      }
      const hk = d.hooks[0];
      const jibBase = s.foot + 2.5;
      bandedPole(jibBase, d.P.z - 1.2, groundAt(jibBase, d.P.z - 1.2), hk.pos.y + 2.4, s.top + HAND);
      rod(new THREE.Vector3(jibBase, hk.pos.y + 2.2, d.P.z - 1.2), new THREE.Vector3(hk.pos.x, hk.pos.y + 2.2, d.P.z - 1.2), 0.06, darkMetal);
      rod(new THREE.Vector3(hk.pos.x, hk.pos.y + 2.2, d.P.z - 1.2), new THREE.Vector3(hk.pos.x, hk.pos.y + 0.45, hk.pos.z), 0.03, cableMat);
      const plumbMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      for (let y = s.top + 0.2; y < hk.pos.y - 0.8; y += 0.6) rod(new THREE.Vector3(hk.pos.x, y, d.P.z), new THREE.Vector3(hk.pos.x, y + 0.3, d.P.z), 0.02, plumbMat);
      const zero = new THREE.Mesh(track(new THREE.CircleGeometry(0.4, 20)), track(new THREE.MeshBasicMaterial({ map: track(labelTexture('0', { bg: '#1f4f52', fg: '#fff6e6' })) })));
      zero.position.set(hk.pos.x, s.top + 0.4, d.P.z + 0.3);
      root.add(zero);
    }
  }

  // ---------- finish arch ----------
  const f = course.finish;
  const finishRing = new THREE.Mesh(track(new THREE.RingGeometry(1.4, 2, 40)), track(new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: 0.85, side: THREE.DoubleSide })));
  finishRing.rotation.x = -Math.PI / 2;
  finishRing.position.set(f.x, f.y + 0.03, f.z);
  root.add(finishRing);
  const postTex = bandTex.clone();
  postTex.needsUpdate = true;
  postTex.repeat.set(1, 2.2);
  track(postTex);
  const postMat = track(new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.6 }));
  const checker = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#1d1d1d' : '#f7f7f2';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return track(t);
  })();
  const flagMat = track(new THREE.MeshStandardMaterial({ map: checker, side: THREE.DoubleSide }));
  const flags: THREE.Mesh[] = [];
  // the arch spans the running line (posts in front of and behind the runner), banner facing the runner
  for (const sz of [-2.6, 2.6]) {
    const post = new THREE.Mesh(cylGeo, postMat);
    post.scale.set(0.16, 4.4, 0.16);
    post.position.set(f.x, f.y + 2.2, f.z + sz);
    post.castShadow = true;
    root.add(post);
    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 0.75)), flagMat);
    flag.position.set(f.x + 0.6, f.y + 4.7, f.z + sz);
    root.add(flag);
    flags.push(flag);
  }
  const banner = new THREE.Mesh(
    track(new THREE.PlaneGeometry(5.2, 1.3)),
    track(new THREE.MeshStandardMaterial({ map: track(signTexture('סיום', '#c8382a', '#fff8ea')), side: THREE.DoubleSide, emissive: 0x551100, emissiveIntensity: night ? 1.5 : 0.25 })),
  );
  banner.position.set(f.x, f.y + 3.75, f.z);
  banner.rotation.y = -Math.PI / 2;
  root.add(banner);

  // ---------- background city behind the course ----------
  const bgCount = 260;
  const bg = new THREE.InstancedMesh(boxGeo, mats[1], bgCount);
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  const minX = course.roofs[0].x0 - 60;
  const maxX = course.roofs[course.roofs.length - 1].x1 + 60;
  const zFront = Math.min(...course.roofs.map((r) => r.z0)) - 6;
  let placed = 0;
  for (let i = 0; i < 4000 && placed < bgCount; i++) {
    const w = 7 + rand() * 9;
    const dz = 7 + rand() * 9;
    const x = minX + rand() * (maxX - minX);
    const z = zFront - 6 - rand() * 90;
    const near = zFront - z < 30;
    const hgt = near ? 6 + rand() * 22 : 8 + rand() * 30;
    mtx.compose(new THREE.Vector3(x, hgt / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, hgt, dz));
    bg.setMatrixAt(placed, mtx);
    col.setHex(night ? 0x9da2c4 : TINTS[Math.floor(rand() * TINTS.length)]);
    bg.setColorAt(placed, col);
    placed++;
  }
  bg.count = placed;
  bg.receiveShadow = true;
  root.add(bg);

  // ---------- props (Tripo) ----------
  function placeProp(src: THREE.Object3D | undefined, x: number, y: number, z: number, rotY: number, s = 1): THREE.Object3D | null {
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    o.scale.multiplyScalar(s);
    root.add(o);
    return o;
  }
  const busyX = (x: number) => course.decisions.some((d) => d.edge !== null && Math.abs(x - d.edge) < 4) || Math.abs(x - f.x) < 5;
  const laundry: THREE.Mesh[] = [];
  const birds = new Birds(assets.flyer ?? null, rand);
  root.add(birds.group);
  for (const r of course.roofs) {
    if (r.kind !== 'roof') continue;
    for (let x = r.x0 + 2.5; x < r.x1 - 2; x += 5 + rand() * 4) {
      if (busyX(x)) continue;
      const zBack = r.z0 + 1.6;
      if (rand() < 0.55) placeProp(assets.heater, x, r.top, zBack, 0);
      else placeProp(assets.tank, x, r.top, zBack - 0.2, rand() * 6.28, 0.9);
    }
    if (r.x1 - r.x0 > 16 && rand() < 0.7) {
      const lx0 = r.x0 + 3;
      const lx1 = Math.min(r.x1 - 3, lx0 + 6);
      if (!busyX((lx0 + lx1) / 2)) {
        const lz = r.z0 + 3.2;
        rod(new THREE.Vector3(lx0, r.top, lz), new THREE.Vector3(lx0, r.top + 2, lz), 0.04, darkMetal);
        rod(new THREE.Vector3(lx1, r.top, lz), new THREE.Vector3(lx1, r.top + 2, lz), 0.04, darkMetal);
        rod(new THREE.Vector3(lx0, r.top + 1.95, lz), new THREE.Vector3(lx1, r.top + 1.95, lz), 0.01, cableMat);
        const colors = ['#e2574c', '#3f8fd2', '#f2c14e', '#ffffff', '#58b368', '#e98bb4'];
        for (let x = lx0 + 0.8; x < lx1 - 0.4; x += 1.1) {
          const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.9 + rand() * 0.4)), track(new THREE.MeshStandardMaterial({ map: track(clothTexture(colors[Math.floor(rand() * colors.length)])), side: THREE.DoubleSide })));
          cloth.position.set(x, r.top + 1.45, lz);
          root.add(cloth);
          laundry.push(cloth);
        }
      }
    }
    if (assets.pigeon) {
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const x = r.x0 + 1 + rand() * (r.x1 - r.x0 - 2);
        const o = placeProp(assets.pigeon, x, r.top + 0.45, r.z0 + 0.15, Math.PI / 2 + (rand() - 0.5), 0.9 + rand() * 0.3);
        if (o) birds.addPerched(o);
      }
    }
  }
  for (let i = 0; i < Math.min(placed, 50); i++) {
    bg.getMatrixAt(i, mtx);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    mtx.decompose(p, new THREE.Quaternion(), s);
    placeProp(i % 3 ? assets.heater : assets.tank, p.x, s.y, p.z, rand() * 6.28);
  }

  if (!night) birds.addCircling(new THREE.Vector3(course.start.x + 10, course.start.y, course.start.z - 10), 4);

  if (bulbs.length) {
    const inst = new THREE.InstancedMesh(bulbGeo, track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), bulbs.length);
    bulbs.forEach((b, i) => {
      inst.setMatrixAt(i, b.m);
      inst.setColorAt(i, b.c.multiplyScalar(1.6));
    });
    root.add(inst);
  }
  void bulbMat;

  const broken = new Map<string, number>();

  function update(dt: number, t: number, sim: Sim, playerPos: THREE.Vector3): void {
    sun.target.position.copy(playerPos);
    sun.position.set(playerPos.x - 18, playerPos.y + 55, playerPos.z - 60);
    const used = new Set(sim.tried);
    for (const v of hooks.values()) {
      v.ring.rotation.y += dt * 1.6;
      const active = sim.state === 'decide' && sim.decision === v.decision;
      const s = active ? 1.25 + Math.sin(t * 5) * 0.08 : 1;
      v.ring.scale.setScalar(s);
      const isUsed = used.has(v.hook.id) && sim.decision === v.decision;
      (v.ring.material as THREE.Material) = isUsed ? usedMat : hookMat;
      if (v.hook.kind === 'bracket') {
        let k = broken.get(v.hook.id) ?? 0;
        k = sim.brokenHook === v.hook.id ? Math.min(1, k + dt * 2.2) : Math.max(0, k - dt * 2.5);
        broken.set(v.hook.id, k);
        v.group.rotation.z = -k * k * 1.2;
      }
    }
    for (const c of canopyViews.values()) {
      if (c.wobble > 0) {
        c.wobble = Math.max(0, c.wobble - dt * 1.6);
        const w = Math.sin(t * 28) * c.wobble;
        c.g.scale.set(1, 1 - w * 0.3, 1);
      }
    }
    for (const [i, c] of laundry.entries()) c.rotation.y = Math.sin(t * 1.7 + i) * 0.25;
    for (const [i, fl] of flags.entries()) fl.rotation.y = Math.sin(t * 3 + i) * 0.25;
    birds.update(dt, t, playerPos);
  }

  return {
    root,
    hooks,
    update,
    bounceCanopy(id: string) {
      const c = canopyViews.get(id);
      if (c) c.wobble = 1;
    },
    scatterPigeons(near: THREE.Vector3) {
      birds.scatter(near, 10);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
