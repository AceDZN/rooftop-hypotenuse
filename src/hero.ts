// The runner: Tripo-generated, Tripo-rigged (Mixamo skeleton) model with Tripo preset clips.
// While hanging on the rope the gauntlet arm is aimed at the hook procedurally.
import * as THREE from 'three';
import type { Sim } from './sim.ts';

type ClipName = 'idle' | 'run' | 'jump' | 'fall' | 'climb' | 'cheer';

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
        if (name === 'jump' || name === 'cheer') {
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

  update(dt: number, sim: Sim, ropeTarget: THREE.Vector3 | null): void {
    const p = sim.p;
    this.root.position.set(p.x, p.y, p.z);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - sim.yaw);
    const speed = Math.hypot(sim.vel.x, sim.vel.z);

    // choose a clip
    switch (sim.state) {
      case 'ground':
        if (speed > 0.8) this.play('run', 0.12, Math.max(0.6, speed / 6.5));
        else this.play('idle', 0.2);
        break;
      case 'dash':
        this.play('run', 0.08, 1.6);
        break;
      case 'air':
        this.play(sim.vel.y > -3 ? 'jump' : 'fall', 0.15);
        break;
      case 'rope':
        this.play('jump', 0.1, 0.6);
        break;
      case 'swing':
      case 'pull':
      case 'miss':
      case 'bounce':
      case 'respawn':
        this.play('fall', 0.12);
        break;
      case 'climb':
        this.play('climb', 0.15, 1.6);
        break;
      case 'finished':
        this.play('cheer', 0.25);
        break;
    }
    this.mixer?.update(dt);

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

function makeFallback(): THREE.Group {
  const g = new THREE.Group();
  const hoodie = new THREE.MeshStandardMaterial({ color: 0xf08a2c, roughness: 0.8 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x2f9c8f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a62, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 8), hoodie);
  torso.position.y = 1.15;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), shorts);
  legs.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
  head.position.y = 1.6;
  for (const m of [torso, legs, head]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
