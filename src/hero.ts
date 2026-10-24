// The runner: Tripo-generated, Tripo-rigged (Mixamo skeleton) model with Tripo preset clips.
// While hanging on the rope the gauntlet arm is aimed at the hook procedurally.
import * as THREE from 'three';
import type { Sim } from './sim.ts';

type ClipName = 'idle' | 'run' | 'jump' | 'fall' | 'climb' | 'cheer' | 'flip';

export class Hero {
  root = new THREE.Group();
  /** visual body (tilted along the rope while swinging) */
  body = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private current: ClipName | null = null;
  private rightArm: THREE.Object3D | null = null;
  private rightFore: THREE.Object3D | null = null;
  private spine: THREE.Object3D | null = null;
  private squash = 0;
  /** world position of the gauntlet (rope origin) */
  hand = new THREE.Vector3();
  private handBone: THREE.Object3D | null = null;
  private fallback: THREE.Group | null = null;
  usesModel = false;
  private animTime = 0;

  constructor() {
    this.root.add(this.body);
    this.fallback = makeFallback();
    this.body.add(this.fallback);
  }

  setModel(gltfScene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const model = gltfScene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });
    // normalise: 1.7 m tall, feet on the origin, facing +Z
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = 1.7 / h;
    model.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
    model.position.x -= (box2.min.x + box2.max.x) / 2;
    model.position.z -= (box2.min.z + box2.max.z) / 2;
    if (this.fallback) {
      this.body.remove(this.fallback);
      this.fallback = null;
    }
    this.body.add(model);
    this.usesModel = true;

    model.traverse((o) => {
      const n = o.name.toLowerCase().replace(/[^a-z]/g, '');
      if (!this.rightArm && /rightarm$/.test(n)) this.rightArm = o;
      if (!this.rightFore && /rightforearm$/.test(n)) this.rightFore = o;
      if (!this.handBone && /righthand$/.test(n)) this.handBone = o;
      if (!this.spine && /spine1?$/.test(n)) this.spine = o;
    });

    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const find = (key: string) => clips.find((c) => c.name.toLowerCase().includes(key));
      const pairs: [ClipName, string][] = [
        ['idle', 'idle'],
        ['run', 'run'],
        ['jump', 'jump'],
        ['fall', 'fall'],
        ['climb', 'climb'],
        ['cheer', 'cheer'],
        ['flip', 'flip'],
      ];
      for (const [name, key] of pairs) {
        const c = find(key);
        if (!c) continue;
        // strip root motion on the hips so the sim stays in charge of position
        for (const tr of c.tracks) {
          if (/hips\.position$/i.test(tr.name)) {
            const v = tr.values;
            for (let i = 0; i < v.length; i += 3) {
              v[i] = v[0];
              v[i + 2] = v[2];
            }
          }
        }
        const a = this.mixer.clipAction(c);
        if (name === 'jump' || name === 'cheer' || name === 'flip') {
          a.setLoop(name === 'cheer' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          a.clampWhenFinished = true;
        }
        this.actions.set(name, a);
      }
    }
  }

  private play(name: ClipName, fade = 0.15, timeScale = 1): void {
    const a = this.actions.get(name) ?? (name === 'fall' ? this.actions.get('jump') : undefined) ?? this.actions.get('idle');
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    a.reset().play();
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  bounce(): void {
    this.squash = 1;
  }

  private yaw = 0;
  private flipT = 0;

  flip(): void {
    this.flipT = 0.9;
  }

  update(dt: number, sim: Sim, ropeTarget: THREE.Vector3 | null): void {
    const p = sim.p;
    this.root.position.set(p.x, p.y, p.z);
    const hv = Math.hypot(sim.vel.x, sim.vel.z);
    if (hv > 0.5) this.yaw = Math.atan2(sim.vel.z, sim.vel.x);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - this.yaw);
    const speed = hv;
    this.flipT = Math.max(0, this.flipT - dt);

    // the world nearly stops while deciding: freeze the pose too
    const animDt = sim.state === 'decide' ? dt * 0.03 : dt;
    switch (sim.state) {
      case 'run':
      case 'strip':
        this.play('run', 0.12, Math.max(0.8, speed / 6.5));
        break;
      case 'leap':
      case 'decide':
      case 'rope':
        this.play('jump', 0.1, 1);
        break;
      case 'fly':
        if (this.flipT > 0) this.play('flip', 0.08, 1.3);
        else this.play(sim.vel.y > -2 ? 'jump' : 'fall', 0.15);
        break;
      case 'swing':
      case 'pull':
      case 'miss':
      case 'bounce':
        this.play('fall', 0.12);
        break;
      case 'climb':
        this.play('climb', 0.12, 2);
        break;
      case 'finished':
        this.play('cheer', 0.25);
        break;
    }
    this.mixer?.update(animDt);
    this.animTime += animDt;
    if (this.fallback) animateFallback(this.fallback, sim.state, speed, this.animTime);

    // body orientation: hang along the rope while swinging/pulling
    let q = yawQ;
    if ((sim.state === 'swing' || sim.state === 'pull') && ropeTarget) {
      const hand = new THREE.Vector3(p.x, p.y + 1, p.z);
      const dir = ropeTarget.clone().sub(hand).normalize();
      const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sim.state === 'pull' ? new THREE.Vector3(0, 1, 0).lerp(dir, 0.35).normalize() : dir);
      q = tilt.multiply(yawQ);
      // hang from the hand: rotate around the hand point instead of the feet
      const off = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
      this.root.position.set(hand.x - off.x, hand.y - off.y, hand.z - off.z);
    }
    this.body.quaternion.slerp(q, Math.min(1, dt * 14));

    // squash on bounces and hard landings
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3.5);
      const k = Math.sin(this.squash * Math.PI) * 0.22;
      this.body.scale.set(1 + k, 1 - k, 1 + k);
    } else this.body.scale.set(1, 1, 1);

    this.root.updateMatrixWorld(true);
    // aim the gauntlet arm at the hook / along the flying rope
    if (ropeTarget && this.rightArm && this.rightFore && (sim.state === 'rope' || sim.state === 'swing' || sim.state === 'pull' || sim.state === 'miss')) {
      aimBone(this.rightArm, this.rightFore, ropeTarget);
      this.root.updateMatrixWorld(true);
    }
    if (this.handBone) this.handBone.getWorldPosition(this.hand);
    else this.hand.set(p.x, p.y + 1, p.z);
    if (!this.usesModel) this.hand.set(p.x, p.y + 1, p.z);
  }
}

/** Rotate `bone` so the direction bone→child points at `target` (world). */
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  bone.getWorldPosition(a);
  child.getWorldPosition(b);
  const cur = b.sub(a).normalize();
  const want = target.clone().sub(a).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const boneWorld = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorld);
  const parentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  const newWorld = delta.multiply(boneWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(newWorld));
}

interface Rig {
  group: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  torso: THREE.Object3D;
}

function makeFallback(): THREE.Group {
  const g = new THREE.Group();
  const hoodie = new THREE.MeshStandardMaterial({ color: 0xf08a2c, roughness: 0.8 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x2f9c8f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a62, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8962e, metalness: 0.7, roughness: 0.35 });
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 4, 10), hoodie);
  chest.position.y = 0.25;
  torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), skin);
  head.position.y = 0.68;
  torso.add(head);
  const curls = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), hair);
  curls.position.y = 0.71;
  torso.add(curls);
  const limb = (len: number, r: number, m: THREE.Material) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), m);
    mesh.position.y = -len / 2 - r;
    pivot.add(mesh);
    return pivot;
  };
  const armL = limb(0.42, 0.06, hoodie);
  armL.position.set(0, 0.48, 0.25);
  const armR = limb(0.42, 0.06, hoodie);
  armR.position.set(0, 0.48, -0.25);
  const gaunt = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.24, 10), brass);
  gaunt.position.y = -0.45;
  armR.add(gaunt);
  torso.add(armL, armR);
  const legL = limb(0.5, 0.08, shorts);
  legL.position.set(0, 0.95, 0.11);
  const legR = limb(0.5, 0.08, shorts);
  legR.position.set(0, 0.95, -0.11);
  for (const l of [legL, legR]) {
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.12), shoe);
    s2.position.set(0.05, -0.72, 0);
    l.add(s2);
  }
  g.add(legL, legR);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  // the fallback faces +X; rotate so it faces +Z like a glTF character
  g.rotation.y = -Math.PI / 2;
  const outer = new THREE.Group();
  outer.add(g);
  outer.userData.rig = { group: g, armL, armR, legL, legR, torso } satisfies Rig;
  return outer;
}

export function animateFallback(fb: THREE.Group, state: string, speed: number, t: number): void {
  const r = fb.userData.rig as Rig | undefined;
  if (!r) return;
  const run = state === 'run' || state === 'strip' ? Math.min(1, speed / 6) : 0;
  const ph = t * (6 + speed * 1.2);
  const sw = Math.sin(ph) * 0.9 * run;
  r.legL.rotation.z = sw;
  r.legR.rotation.z = -sw;
  r.armL.rotation.z = -sw * 0.8;
  r.armR.rotation.z = sw * 0.8;
  r.torso.rotation.z = -0.15 * run;
  if (state === 'swing' || state === 'pull' || state === 'rope') {
    r.armR.rotation.z = Math.PI * 0.95;
    r.armL.rotation.z = 0.6;
    r.legL.rotation.z = 0.5;
    r.legR.rotation.z = 0.2;
  } else if (state === 'fly' || state === 'leap' || state === 'decide' || state === 'miss' || state === 'bounce') {
    r.armL.rotation.z = 2.4 + Math.sin(t * 20) * 0.4;
    r.armR.rotation.z = 2.2 + Math.cos(t * 20) * 0.4;
    r.legL.rotation.z = 0.6;
    r.legR.rotation.z = -0.3;
  } else if (state === 'climb') {
    r.armL.rotation.z = 2.8 + Math.sin(t * 12) * 0.4;
    r.armR.rotation.z = 2.8 - Math.sin(t * 12) * 0.4;
    r.legL.rotation.z = Math.sin(t * 12) * 0.5;
    r.legR.rotation.z = -Math.sin(t * 12) * 0.5;
  } else if (state === 'finished') {
    r.armL.rotation.z = 3 + Math.sin(t * 8) * 0.2;
    r.armR.rotation.z = 3 - Math.sin(t * 8) * 0.2;
  }
}
