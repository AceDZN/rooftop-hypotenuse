// Builds the Three.js scene for one level from pure level data. Everything math-critical
// (roof edges, planks, hooks, poles with 1 m bands, awnings) is exact procedural geometry.
import * as THREE from 'three';
import { anchorWorld, handOf, markById, type AnchorDef, type Box, type Level } from './levels.ts';
import type { Sim } from './sim.ts';
import {
  bandTexture,
  clothTexture,
  facadeGlow,
  facadeTexture,
  hazardTexture,
  labelTexture,
  rustTexture,
  signTexture,
  stripeTexture,
} from './textures.ts';

export interface PropAssets {
  heater?: THREE.Object3D;
  tank?: THREE.Object3D;
  pigeon?: THREE.Object3D;
}

interface Pigeon {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  vel: THREE.Vector3;
  flying: number;
  phase: number;
}

export interface AnchorView {
  def: AnchorDef;
  pos: THREE.Vector3;
  ring: THREE.Mesh;
  group: THREE.Group;
  /** frame member midpoints and labels for the converse level */
  members?: { mid: THREE.Vector3; text: string }[];
  hinge?: THREE.Vector3;
}

export interface World {
  root: THREE.Group;
  anchors: Map<string, AnchorView>;
  sun: THREE.DirectionalLight;
  update(dt: number, t: number, sim: Sim, playerPos: THREE.Vector3): void;
  bounceAwning(id: string): void;
  scatterPigeons(near: THREE.Vector3): void;
  dispose(): void;
}

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
    m.emissiveIntensity = 1.1;
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
        bool isTop = vWNrm.y > 0.5;
        if (isTop) {
          vec2 g = abs(fract(vWPos.xz + 0.5) - 0.5) / (fwidth(vWPos.xz) * 1.4);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          vec2 g5 = abs(fract(vWPos.xz / 5.0 + 0.5) - 0.5) * 5.0 / (fwidth(vWPos.xz) * 2.2);
          float line5 = 1.0 - min(min(g5.x, g5.y), 1.0);
          vec3 tile = uRoof * (0.96 + 0.04 * sin(floor(vWPos.x) * 12.9 + floor(vWPos.z) * 78.2));
          diffuseColor.rgb *= mix(tile, uLine, max(line * 0.6, line5 * 0.85));
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
      uTop: { value: new THREE.Color(night ? 0x0b1430 : 0x3f8f9f) },
      uMid: { value: new THREE.Color(night ? 0x1d2c5a : 0xf0a46a) },
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
        c += uSunCol * (pow(d, 900.0) * 2.5 + pow(d, 24.0) * 0.35 * (1.0 - uNight) + pow(d, 4.0) * 0.12);
        if (uNight > 0.5) {
          vec2 sp = floor(vDir.xz / (vDir.y + 0.3) * 260.0);
          float s = step(0.996, hash(sp)) * smoothstep(0.1, 0.4, h);
          c += vec3(s) * 0.8;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function buildWorld(level: Level, assets: PropAssets, quality: { shadows: boolean }): World {
  const night = level.night;
  const root = new THREE.Group();
  const rand = seeded(level.num * 977 + 13);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // ---------- sky, sea, light ----------
  const sunDir = night ? new THREE.Vector3(0.5, 0.55, -0.6) : new THREE.Vector3(0.9, 0.12, -0.42);
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 32, 16)), track(skyMaterial(night, sunDir)));
  sky.renderOrder = -10;
  root.add(sky);

  const sea = new THREE.Mesh(
    track(new THREE.PlaneGeometry(4000, 1400)),
    track(new THREE.MeshStandardMaterial({ color: night ? 0x18264a : 0x2f8ea0, roughness: 0.25, metalness: 0.35 })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(700 + 160, 0.2, 0);
  root.add(sea);
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(600, 900)),
    track(new THREE.MeshStandardMaterial({ color: night ? 0x2a2e44 : 0xc9b79c, roughness: 1 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  root.add(ground);

  const hemi = new THREE.HemisphereLight(night ? 0x5a6db0 : 0xd6eef2, night ? 0x22223a : 0xffb27a, night ? 0.9 : 1.55);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(night ? 0xbcc8ff : 0xffc890, night ? 1.0 : 3.4);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun);
  root.add(sun.target);

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
  const rust = track(rustTexture());
  const hazard = track(hazardTexture());
  const steelMat = track(new THREE.MeshStandardMaterial({ map: rust, roughness: 0.7, metalness: 0.35 }));
  const hazardMat = track(new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6 }));
  const whiteMat = track(new THREE.MeshStandardMaterial({ color: night ? 0xc4c7dd : 0xfbf6ec, roughness: 0.85 }));
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 }));
  const hookMat = track(new THREE.MeshStandardMaterial({ color: 0xffb13b, emissive: 0xff8a1a, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.5 }));
  const cableMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
  const bulbMat = track(new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd36a, emissiveIntensity: 3 }));

  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const cylGeo = track(new THREE.CylinderGeometry(1, 1, 1, 12, 1));

  function boxMesh(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  /** Cylinder between two points. */
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

  function topAt(x: number, z: number): number {
    let t = 0;
    for (const b of level.boxes) if (b.kind === 'roof' && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) t = Math.max(t, b.top);
    return t;
  }

  /** Pole with 1 m bands aligned to the hand height of the take-off mark (so you can count). */
  function bandedPole(x: number, z: number, y0: number, y1: number, handY: number, r = 0.16): THREE.Mesh {
    const t = bandTex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, (y1 - y0) / 2);
    t.offset.set(0, (((y0 - handY) / 2) % 1 + 1) % 1);
    track(t);
    const mat = track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
    const m = new THREE.Mesh(cylGeo, mat);
    m.scale.set(r, y1 - y0, r);
    m.position.set(x, (y0 + y1) / 2, z);
    m.castShadow = true;
    root.add(m);
    // yellow collar at hand height = "0"
    const collar = new THREE.Mesh(cylGeo, hookMat);
    collar.scale.set(r * 1.25, 0.08, r * 1.25);
    collar.position.set(x, handY, z);
    root.add(collar);
    if (night) {
      for (let y = Math.ceil(handY - y0) + y0; y <= y1; y += 1) bulb(x + r * 1.3, y, z);
    }
    return m;
  }

  const bulbGeo = track(new THREE.SphereGeometry(0.09, 8, 6));
  const bulbs: THREE.Matrix4[] = [];
  function bulb(x: number, y: number, z: number): void {
    bulbs.push(new THREE.Matrix4().makeTranslation(x, y, z));
  }

  // ---------- course buildings ----------
  const balconyGeo = track(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 20, 1, false, 0, Math.PI));
  const railGeo = track(new THREE.CylinderGeometry(1.45, 1.45, 0.9, 20, 1, true, 0, Math.PI));
  const railMat = track(new THREE.MeshStandardMaterial({ color: night ? 0xaab0cc : 0xffffff, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  const roofBoxes = level.boxes.filter((b) => b.kind === 'roof');
  for (const b of roofBoxes) {
    const mat = mats[(b.tint ?? 0) % mats.length];
    boxMesh(mat, b.x0, b.x1, b.y0, b.top, b.z0, b.z1);
    addParapet(b);
    addBalconies(b);
  }

  function addParapet(b: Box): void {
    const h = 0.32;
    const w = 0.22;
    const gaps = level.boxes.filter((p) => p.kind !== 'roof' && Math.abs(p.top - b.top) < 0.01);
    const segs: [number, number, number, number][] = [
      [b.x0, b.x1, b.z0, b.z0 + w],
      [b.x0, b.x1, b.z1 - w, b.z1],
      [b.x0, b.x0 + w, b.z0, b.z1],
      [b.x1 - w, b.x1, b.z0, b.z1],
    ];
    for (const [x0, x1, z0, z1] of segs) {
      // cut where a plank leaves the roof
      const cut = gaps.find((g) => g.x0 < x1 + 0.3 && g.x1 > x0 - 0.3 && g.z0 < z1 + 0.3 && g.z1 > z0 - 0.3);
      if (cut && x1 - x0 < 1) {
        if (cut.z0 > z0) boxMesh(whiteMat, x0, x1, b.top, b.top + h, z0, cut.z0 - 0.3);
        if (cut.z1 < z1) boxMesh(whiteMat, x0, x1, b.top, b.top + h, cut.z1 + 0.3, z1);
      } else if (cut && z1 - z0 < 1) {
        if (cut.x0 > x0) boxMesh(whiteMat, x0, cut.x0 - 0.3, b.top, b.top + h, z0, z1);
        if (cut.x1 < x1) boxMesh(whiteMat, cut.x1 + 0.3, x1, b.top, b.top + h, z0, z1);
      } else boxMesh(whiteMat, x0, x1, b.top, b.top + h, z0, z1);
    }
  }

  function addBalconies(b: Box): void {
    if (b.top < 9) return;
    const sides: { axis: 'z0' | 'z1'; z: number; rot: number }[] = [
      { axis: 'z0', z: b.z0, rot: Math.PI / 2 },
      { axis: 'z1', z: b.z1, rot: -Math.PI / 2 },
    ];
    for (const s of sides) {
      for (let y = b.top - 4.2; y > 3; y -= 3) {
        for (let x = b.x0 + 3; x < b.x1 - 2.5; x += 7 + Math.floor(rand() * 3)) {
          if (rand() < 0.35) continue;
          const slab = new THREE.Mesh(balconyGeo, whiteMat);
          slab.position.set(x, y, s.z);
          slab.rotation.y = s.rot;
          slab.castShadow = true;
          root.add(slab);
          const rail = new THREE.Mesh(railGeo, railMat);
          rail.position.set(x, y + 0.5, s.z);
          rail.rotation.y = s.rot;
          root.add(rail);
        }
      }
    }
  }

  // ---------- planks, walkway, marks ----------
  for (const b of level.boxes) {
    if (b.kind === 'roof') continue;
    boxMesh(steelMat, b.x0, b.x1, b.y0, b.top, b.z0, b.z1);
    // support strut under the plank back to the wall
    const host = roofBoxes.find((r) => Math.abs(r.top - b.top) < 0.01 && b.x0 <= r.x1 + 0.3 && b.x1 >= r.x0 - 0.3 && b.z0 <= r.z1 + 0.3 && b.z1 >= r.z0 - 0.3);
    if (host && b.kind === 'plank') {
      const tipX = b.x1 - 0.3;
      const wallX = Math.min(b.x1, host.x1);
      rod(new THREE.Vector3(tipX, b.y0, (b.z0 + b.z1) / 2), new THREE.Vector3(wallX, b.top - 1.8, (b.z0 + b.z1) / 2), 0.06, darkMetal);
      boxMesh(hazardMat, b.x1 - 0.18, b.x1, b.top, b.top + 0.04, b.z0, b.z1, false);
    }
    if (b.kind === 'walkway') {
      // scaffold rails and uprights
      for (const z of [b.z0, b.z1]) {
        rod(new THREE.Vector3(b.x0, b.top + 1.0, z), new THREE.Vector3(b.x1 - 0.3, b.top + 1.0, z), 0.035, darkMetal);
        for (let x = Math.ceil(b.x0); x <= b.x1; x += 2) rod(new THREE.Vector3(x, b.y0 - 4.2, z), new THREE.Vector3(x, b.top + 1.0, z), 0.04, darkMetal);
      }
    }
  }
  const markMat = track(new THREE.MeshBasicMaterial({ map: track(labelTexture('', { ring: '#ff8a1a' })), transparent: true, depthWrite: false }));
  const markGeo = track(new THREE.PlaneGeometry(0.95, 0.95));
  const markViews = new Map<string, THREE.Mesh>();
  for (const m of level.marks) {
    let mat: THREE.Material = markMat;
    if (m.label) {
      mat = track(new THREE.MeshBasicMaterial({ map: track(labelTexture(m.label, { ring: '#ff8a1a', fg: '#fff3dc' })), transparent: true, depthWrite: false }));
    }
    const mesh = new THREE.Mesh(markGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(m.x, m.top + 0.02, m.z);
    root.add(mesh);
    markViews.set(m.id, mesh);
  }

  // ---------- awnings ----------
  const stripes = track(stripeTexture());
  stripes.repeat.set(3, 1);
  const awningMat = track(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85, side: THREE.DoubleSide }));
  const awningViews = new Map<string, { g: THREE.Group; wobble: number }>();
  for (const w of level.awnings) {
    const g = new THREE.Group();
    g.position.set(w.x, w.top, w.z);
    g.rotation.y = -Math.atan2(w.dir.z, w.dir.x);
    const canvasGeo = track(new THREE.PlaneGeometry(w.halfLen * 2, w.halfWide * 2, 6, 2));
    const cloth = new THREE.Mesh(canvasGeo, awningMat);
    cloth.rotation.x = -Math.PI / 2;
    cloth.rotation.y = 0.12; // slopes down away from the wall
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    g.add(cloth);
    // scalloped valance at the outer edge
    const val = new THREE.Mesh(track(new THREE.PlaneGeometry(w.halfWide * 2, 0.45)), awningMat);
    val.position.set(w.halfLen, -0.42, 0);
    val.rotation.y = Math.PI / 2;
    g.add(val);
    for (const s of [-1, 1]) {
      rod(new THREE.Vector3(w.halfLen, -0.2, s * w.halfWide), new THREE.Vector3(-w.halfLen, -1.6, s * w.halfWide), 0.04, darkMetal, g);
    }
    root.add(g);
    awningViews.set(w.id, { g, wobble: 0 });
  }

  // ---------- anchors ----------
  const anchors = new Map<string, AnchorView>();
  const ringGeo = track(new THREE.TorusGeometry(0.3, 0.075, 10, 24));
  const hookGeo = track(new THREE.TorusGeometry(0.17, 0.05, 8, 16, Math.PI * 1.3));
  const signWords = ['פלאפל', 'גלידה', 'מיץ טבעי', 'ספרים', 'בורקס'];
  let signIdx = 0;
  for (const a of level.anchors) {
    const P = anchorWorld(level, a);
    const pos = new THREE.Vector3(P.x, P.y, P.z);
    const hand = handOf(markById(level, a.mark));
    const group = new THREE.Group();
    root.add(group);
    const ring = new THREE.Mesh(ringGeo, hookMat);
    ring.position.copy(pos);
    group.add(ring);
    const hook = new THREE.Mesh(hookGeo, hookMat);
    hook.position.copy(pos).add(new THREE.Vector3(0, -0.42, 0));
    hook.rotation.z = Math.PI * 0.85;
    group.add(hook);
    const view: AnchorView = { def: a, pos, ring, group };

    if (a.kind === 'swing') {
      // two banded poles 7 m to each side of the swing plane, cable sagging to the hook
      const perp = new THREE.Vector3(-a.dir.z, 0, a.dir.x);
      const span = 7;
      const tops: THREE.Vector3[] = [];
      for (const s of [-1, 1]) {
        const x = P.x + perp.x * span * s;
        const z = P.z + perp.z * span * s;
        const base = topAt(x, z);
        const top = P.y + 2.2;
        bandedPole(x, z, base, top, hand.y);
        tops.push(new THREE.Vector3(x, top, z));
      }
      const hang = pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      rod(tops[0], hang, 0.03, cableMat, group);
      rod(hang, tops[1], 0.03, cableMat, group);
      rod(hang, pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.025, cableMat, group);
      if (night) {
        for (const t of tops) {
          const n = Math.floor(t.distanceTo(hang));
          for (let i = 1; i < n; i++) {
            const q = t.clone().lerp(hang, i / n);
            bulb(q.x, q.y - 0.12, q.z);
          }
        }
      }
    } else if (a.kind === 'pull') {
      const base = topAt(P.x + a.dir.x * 0.5, P.z + a.dir.z * 0.5);
      bandedPole(P.x, P.z, base, P.y - 0.25, hand.y, 0.12);
    } else if (a.kind === 'bracket' && a.frame) {
      const { post, beam, brace } = a.frame;
      // honest geometry: P (top of post) and Q (bottom) on the wall, T is the hook.
      // dy = (brace² − post² − beam²) / (2·post) is 0 exactly for a right triangle.
      const dy = (brace * brace - post * post - beam * beam) / (2 * post);
      const dz = Math.sqrt(beam * beam - dy * dy);
      const Pw = new THREE.Vector3(P.x, P.y - dy, P.z + dz);
      const Qw = new THREE.Vector3(P.x, P.y - dy - post, P.z + dz);
      const bracket = new THREE.Group();
      bracket.position.copy(Pw);
      group.add(bracket);
      const loc = (v: THREE.Vector3) => v.clone().sub(Pw);
      const beamMat = track(new THREE.MeshStandardMaterial({ color: dy === 0 ? 0x2f6f6a : 0x6b4a3a, roughness: 0.6, metalness: 0.4 }));
      rod(loc(Pw), loc(pos), 0.11, beamMat, bracket);
      rod(loc(Pw), loc(Qw), 0.11, beamMat, bracket);
      rod(loc(Qw), loc(pos), 0.09, beamMat, bracket);
      // sign board hanging under the beam
      const sign = new THREE.Mesh(
        track(new THREE.PlaneGeometry(4.2, 2.1)),
        track(new THREE.MeshStandardMaterial({ map: track(signTexture(signWords[signIdx++ % signWords.length], dy === 0 ? '#1f6f68' : '#b2462e', '#fff3dc')), side: THREE.DoubleSide, roughness: 0.7 })),
      );
      sign.position.copy(loc(new THREE.Vector3(P.x, (P.y + Pw.y) / 2 - 1.7, (P.z + Pw.z) / 2)));
      sign.rotation.y = Math.PI / 2;
      bracket.add(sign);
      rod(loc(new THREE.Vector3(P.x, (P.y + Pw.y) / 2 - 0.2, (P.z + Pw.z) / 2 - 1.6)), loc(new THREE.Vector3(P.x, (P.y + Pw.y) / 2 - 0.65, (P.z + Pw.z) / 2 - 1.6)), 0.02, cableMat, bracket);
      rod(loc(new THREE.Vector3(P.x, (P.y + Pw.y) / 2 - 0.2, (P.z + Pw.z) / 2 + 1.6)), loc(new THREE.Vector3(P.x, (P.y + Pw.y) / 2 - 0.65, (P.z + Pw.z) / 2 + 1.6)), 0.02, cableMat, bracket);
      // move the hook with the bracket
      group.remove(ring, hook);
      ring.position.copy(loc(pos));
      hook.position.copy(loc(pos)).add(new THREE.Vector3(0, -0.42, 0));
      bracket.add(ring, hook);
      // wall plate bridging any gap to the facade
      const wall = level.boxes.find((b) => b.id.startsWith('WALL') && P.x >= b.x0 && P.x <= b.x1);
      if (wall && wall.z0 > Pw.z + 0.02) boxMesh(darkMetal, P.x - 0.2, P.x + 0.2, Qw.y - 0.2, Pw.y + 0.2, Pw.z, wall.z0, false);
      view.group = bracket;
      view.hinge = Pw.clone();
      view.members = [
        { mid: Pw.clone().lerp(Qw, 0.5), text: String(post) },
        { mid: Pw.clone().lerp(pos, 0.5), text: String(beam) },
        { mid: Qw.clone().lerp(pos, 0.5), text: String(brace) },
      ];
    }
    anchors.set(a.id, view);
  }

  // night: string of bulbs every metre across each gap at hand height
  if (night) {
    for (const m of level.marks) {
      const h = handOf(m);
      for (let i = 1; i <= 14; i++) bulb(h.x + m.dir.x * i, h.y, h.z + m.dir.z * i + 0.6);
      rod(new THREE.Vector3(h.x, h.y + 0.08, h.z + 0.6), new THREE.Vector3(h.x + m.dir.x * 14, h.y + 0.08, h.z + 0.6), 0.012, cableMat);
    }
  }

  // ---------- courtyard grid for the space level ----------
  if (level.courtyard) {
    const c = level.courtyard;
    const floor = boxMesh(mats[2], c.x0 - 6, c.x1 + 16, -0.5, 0.05, c.z0 - 6, c.z1 + 16, false);
    floor.receiveShadow = true;
    const axisMat = track(new THREE.MeshBasicMaterial({ color: 0xff8a1a }));
    boxMesh(axisMat, 0, 14, 0.06, 0.1, -0.06, 0.06, false);
    boxMesh(axisMat, -0.06, 0.06, 0.06, 0.1, 0, 14, false);
    const lx = new THREE.Mesh(track(new THREE.PlaneGeometry(1.2, 1.2)), track(new THREE.MeshBasicMaterial({ map: track(labelTexture('x', { fg: '#ff8a1a' })), transparent: true })));
    lx.rotation.x = -Math.PI / 2;
    lx.position.set(14.8, 0.12, 0);
    root.add(lx);
    const lz = lx.clone();
    (lz as THREE.Mesh).material = track(new THREE.MeshBasicMaterial({ map: track(labelTexture('z', { fg: '#ff8a1a' })), transparent: true }));
    lz.position.set(0, 0.12, 14.8);
    root.add(lz);
  }

  // ---------- finish ----------
  const fb = level.boxes.find((b) => b.id === level.finish.box)!;
  const fx = level.finish.x;
  const fz = level.finish.z;
  const finishRing = new THREE.Mesh(track(new THREE.RingGeometry(1.6, 2.2, 40)), track(new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })));
  finishRing.rotation.x = -Math.PI / 2;
  finishRing.position.set(fx, fb.top + 0.03, fz);
  root.add(finishRing);
  rod(new THREE.Vector3(fx, fb.top, fz - 2.4), new THREE.Vector3(fx, fb.top + 3.6, fz - 2.4), 0.07, darkMetal);
  rod(new THREE.Vector3(fx, fb.top, fz + 2.4), new THREE.Vector3(fx, fb.top + 3.6, fz + 2.4), 0.07, darkMetal);
  const banner = new THREE.Mesh(
    track(new THREE.PlaneGeometry(4.8, 1.1)),
    track(new THREE.MeshStandardMaterial({ map: track(signTexture('סיום', '#ff8a1a', '#fff8ea')), side: THREE.DoubleSide, emissive: 0x552200, emissiveIntensity: night ? 1.5 : 0.2 })),
  );
  banner.position.set(fx, fb.top + 3.1, fz);
  banner.rotation.y = -Math.PI / 2;
  root.add(banner);

  // ---------- background city ----------
  const bgCount = 240;
  const bg = new THREE.InstancedMesh(boxGeo, mats[1], bgCount);
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  let placed = 0;
  const minX = Math.min(...level.boxes.map((b) => b.x0)) - 70;
  const maxX = Math.max(...level.boxes.map((b) => b.x1)) + 60;
  const minZ = Math.min(...level.boxes.map((b) => b.z0)) - 80;
  const maxZ = Math.max(...level.boxes.map((b) => b.z1)) + 80;
  const course = level.boxes;
  const anchorPts = [...anchors.values()].map((v) => v.pos);
  for (let tries = 0; tries < 3000 && placed < bgCount; tries++) {
    const w = 6 + rand() * 10;
    const d = 6 + rand() * 10;
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    const clear = course.every((b) => x + w / 2 < b.x0 - 9 || x - w / 2 > b.x1 + 9 || z + d / 2 < b.z0 - 9 || z - d / 2 > b.z1 + 9);
    const clearHooks = anchorPts.every((p) => Math.hypot(p.x - x, p.z - z) > 20);
    if (!clear || !clearHooks) continue;
    const distToCourse = Math.min(...course.map((b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))));
    const h = 4 + rand() * (distToCourse < 30 ? 12 : 20);
    mtx.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    bg.setMatrixAt(placed, mtx);
    col.setHex(night ? 0x9da2c4 : TINTS[Math.floor(rand() * TINTS.length)]);
    bg.setColorAt(placed, col);
    placed++;
  }
  bg.count = placed;
  bg.castShadow = false;
  bg.receiveShadow = true;
  root.add(bg);

  // ---------- props (Tripo models) ----------
  const laundry: THREE.Mesh[] = [];
  const keepClear = (x: number, z: number): boolean => {
    for (const m of level.marks) if (Math.hypot(m.x - x, m.z - z) < 5) return false;
    if (Math.hypot(level.finish.x - x, level.finish.z - z) < 5) return false;
    if (Math.hypot(level.start.x - x, level.start.z - z) < 3) return false;
    return true;
  };
  function placeProp(src: THREE.Object3D | undefined, x: number, y: number, z: number, rotY: number, s = 1): THREE.Object3D | null {
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    o.scale.multiplyScalar(s);
    root.add(o);
    return o;
  }
  for (const b of roofBoxes) {
    if (b.id.startsWith('WALL')) continue;
    const area = (b.x1 - b.x0) * (b.z1 - b.z0);
    const n = Math.min(4, Math.floor(area / 60));
    for (let i = 0; i < n; i++) {
      // hug the side parapets so the running lane stays open
      const side = rand() < 0.5 ? b.z0 + 1.6 : b.z1 - 1.6;
      const x = b.x0 + 2 + rand() * (b.x1 - b.x0 - 4);
      if (!keepClear(x, side)) continue;
      if (rand() < 0.6) placeProp(assets.heater, x, b.top, side, side < (b.z0 + b.z1) / 2 ? Math.PI : 0);
      else placeProp(assets.tank, x, b.top, side, rand() * Math.PI * 2);
    }
    // laundry line on bigger roofs
    if (area > 140 && rand() < 0.7) addLaundry(b);
  }
  // background roofs get a few heaters too (skyline silhouette)
  for (let i = 0; i < Math.min(placed, 40); i++) {
    bg.getMatrixAt(i, mtx);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    mtx.decompose(p, q, s);
    placeProp(i % 3 ? assets.heater : assets.tank, p.x, s.y, p.z, rand() * 6.28, 1);
  }

  function addLaundry(b: Box): void {
    const z = b.z1 - 3;
    const x0 = b.x0 + 2;
    const x1 = Math.min(b.x1 - 2, x0 + 7);
    if (!keepClear((x0 + x1) / 2, z)) return;
    rod(new THREE.Vector3(x0, b.top, z), new THREE.Vector3(x0, b.top + 2, z), 0.04, darkMetal);
    rod(new THREE.Vector3(x1, b.top, z), new THREE.Vector3(x1, b.top + 2, z), 0.04, darkMetal);
    rod(new THREE.Vector3(x0, b.top + 1.95, z), new THREE.Vector3(x1, b.top + 1.95, z), 0.01, cableMat);
    const colors = ['#e2574c', '#3f8fd2', '#f2c14e', '#ffffff', '#58b368', '#e98bb4'];
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.1) {
      const cloth = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.9 + rand() * 0.4)), track(new THREE.MeshStandardMaterial({ map: track(clothTexture(colors[Math.floor(rand() * colors.length)])), side: THREE.DoubleSide })));
      cloth.position.set(x, b.top + 1.45, z);
      cloth.castShadow = true;
      root.add(cloth);
      laundry.push(cloth);
    }
  }

  const pigeons: Pigeon[] = [];
  if (assets.pigeon) {
    for (const b of roofBoxes) {
      if (b.id.startsWith('WALL')) continue;
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const x = b.x0 + 1 + rand() * (b.x1 - b.x0 - 2);
        const z = rand() < 0.5 ? b.z0 + 0.12 : b.z1 - 0.12;
        const o = placeProp(assets.pigeon, x, b.top + 0.32, z, rand() * 6.28, 0.9 + rand() * 0.3);
        if (o) pigeons.push({ obj: o, home: o.position.clone(), vel: new THREE.Vector3(), flying: 0, phase: rand() * 10 });
      }
    }
  }

  if (bulbs.length) {
    const inst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    bulbs.forEach((m, i) => inst.setMatrixAt(i, m));
    root.add(inst);
  }

  const brokenState = new Map<string, number>();

  function update(dt: number, t: number, sim: Sim, playerPos: THREE.Vector3): void {
    sun.target.position.copy(playerPos);
    sun.position.copy(playerPos).addScaledVector(sunDir, 60);
    // active mark pulse
    const active = sim.activeMark();
    for (const [id, mesh] of markViews) {
      const on = active?.id === id;
      const s = on ? 1 + Math.sin(t * 6) * 0.08 : 0.85;
      mesh.scale.set(s, s, s);
    }
    for (const v of anchors.values()) {
      v.ring.rotation.y += dt * 1.4;
    }
    // brackets: a crooked one swings down when it breaks, then is bolted back for the retry
    for (const v of anchors.values()) {
      if (!v.hinge) continue;
      const broken = sim.brokenAnchor === v.def.id;
      let k = brokenState.get(v.def.id) ?? 0;
      k = broken ? Math.min(1, k + dt * 2.2) : Math.max(0, k - dt * 3);
      brokenState.set(v.def.id, k);
      v.group.rotation.x = -k * k * 1.1;
      v.group.rotation.z = k * 0.15;
    }
    for (const [, a] of awningViews) {
      if (a.wobble > 0) {
        a.wobble = Math.max(0, a.wobble - dt * 1.6);
        const w = Math.sin(t * 28) * a.wobble;
        a.g.scale.set(1, 1 - w * 0.25, 1 + w * 0.04);
      }
    }
    for (const [i, c] of laundry.entries()) c.rotation.y = Math.sin(t * 1.7 + i) * 0.25;
    for (const p of pigeons) {
      if (p.flying > 0) {
        p.flying -= dt;
        p.vel.y += dt * 1.5;
        p.obj.position.addScaledVector(p.vel, dt);
        p.obj.rotation.z = Math.sin(t * 30 + p.phase) * 0.35;
        if (p.flying <= 0) {
          p.obj.position.copy(p.home);
          p.obj.rotation.z = 0;
          p.vel.set(0, 0, 0);
        }
      } else {
        p.obj.rotation.x = Math.max(0, Math.sin(t * 2.3 + p.phase)) * 0.35; // pecking
        if (p.obj.position.distanceTo(playerPos) < 3.2) scatter(p, playerPos);
      }
    }
  }

  function scatter(p: Pigeon, from: THREE.Vector3): void {
    if (p.flying > 0) return;
    const away = p.obj.position.clone().sub(from).setY(0).normalize();
    p.vel.set(away.x * 7 + (rand() - 0.5) * 3, 4 + rand() * 2, away.z * 7 + (rand() - 0.5) * 3);
    p.obj.rotation.y = Math.atan2(-p.vel.z, p.vel.x) + Math.PI / 2;
    p.flying = 7;
  }

  return {
    root,
    anchors,
    sun,
    update,
    bounceAwning(id: string) {
      const a = awningViews.get(id);
      if (a) a.wobble = 1;
    },
    scatterPigeons(near: THREE.Vector3) {
      for (const p of pigeons) if (p.obj.position.distanceTo(near) < 9) scatter(p, near);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
