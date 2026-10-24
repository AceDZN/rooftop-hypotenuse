// Pigeons: Tripo "perched" pigeons sit on parapets and peck; when the runner comes close they swap to the
// Tripo "flying" pigeon (wings spread) and flap away. Flapping uses the model's own animation clip when it
// has one (Tripo rig); otherwise the wings are bent in the vertex shader around the shoulder axis.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface FlyerSource {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

interface WingBone {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  axis: THREE.Vector3;
  sign: number;
  weight: number;
  lag: number;
}

interface Flyer {
  obj: THREE.Object3D;
  wings: WingBone[];
  flap: number;
  vel: THREE.Vector3;
  life: number;
  phase: number;
  flapUniforms: { value: number }[];
  mixer: THREE.AnimationMixer | null;
  orbit?: { center: THREE.Vector3; r: number; speed: number; angle: number; h: number };
}

interface Perched {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  away: number;
  phase: number;
}

const FLAP_VERTEX = `
  {
    float sx = uFlapAxis < 0.5 ? transformed.x : transformed.z;
    float ax = abs(sx) - uFlapBody;
    if (ax > 0.0) {
      float k = clamp(ax / max(uFlapHalf - uFlapBody, 0.001), 0.0, 1.0);
      float ang = sin(uFlapTime) * uFlapAmp * (0.55 + 0.45 * k);
      float ns = sign(sx) * (uFlapBody + ax * cos(ang));
      transformed.y += ax * sin(ang);
      if (uFlapAxis < 0.5) transformed.x = ns; else transformed.z = ns;
    }
  }
`;

/** Make a flapping copy of a static spread-wing mesh. Returns the per-bird time uniforms. */
function addShaderFlap(root: THREE.Object3D): { value: number }[] {
  const uniforms: { value: number }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    const sx = bb.max.x - bb.min.x;
    const sz = bb.max.z - bb.min.z;
    const axis = sx >= sz ? 0 : 1;
    const half = (axis === 0 ? sx : sz) / 2;
    const time = { value: 0 };
    uniforms.push(time);
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlapTime = time;
      sh.uniforms.uFlapAxis = { value: axis };
      sh.uniforms.uFlapHalf = { value: half };
      sh.uniforms.uFlapBody = { value: half * 0.2 };
      sh.uniforms.uFlapAmp = { value: 0.75 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uFlapTime, uFlapAxis, uFlapHalf, uFlapBody, uFlapAmp;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FLAP_VERTEX}`);
    };
    m.material = mat;
    m.castShadow = true;
  });
  return uniforms;
}

export class Birds {
  group = new THREE.Group();
  private flyers: Flyer[] = [];
  private perched: Perched[] = [];
  private flySrc: FlyerSource | null;
  private rand: () => number;

  constructor(flySrc: FlyerSource | null, rand: () => number) {
    this.flySrc = flySrc;
    this.rand = rand;
  }

  addPerched(obj: THREE.Object3D): void {
    this.perched.push({ obj, home: obj.position.clone(), away: 0, phase: this.rand() * 10 });
    this.group.add(obj);
  }

  private makeFlyer(): Flyer | null {
    if (!this.flySrc) return null;
    const hasClip = this.flySrc.clips.length > 0;
    let skinned = false;
    this.flySrc.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });
    const obj = skinned ? cloneSkinned(this.flySrc.scene) : this.flySrc.scene.clone(true);
    let mixer: THREE.AnimationMixer | null = null;
    let flapUniforms: { value: number }[] = [];
    // Tripo "Other" rig: shoulder + elbow bones of each wing, flapped around the bird's forward axis
    const wings: WingBone[] = [];
    obj.updateMatrixWorld(true);
    const rootQ = new THREE.Quaternion();
    obj.getWorldQuaternion(rootQ);
    const forward = new THREE.Vector3(0, 1, 0); // body axis in the model's own space (head is +Y)
    const spec: [string, number, number, number][] = [
      ['bone_8', 1, 1, 0],
      ['bone_9', 1, 0.6, 0.6],
      ['bone_12', -1, 1, 0],
      ['bone_13', -1, 0.6, 0.6],
    ];
    for (const [name, sign, weight, lag] of spec) {
      const bone = obj.getObjectByName(name) as THREE.Bone | undefined;
      if (!bone || !bone.isBone) continue;
      const bw = new THREE.Quaternion();
      bone.getWorldQuaternion(bw);
      // express the model-space forward axis in the bone's local frame
      const axis = forward.clone().applyQuaternion(rootQ).applyQuaternion(bw.clone().invert()).normalize();
      wings.push({ bone, rest: bone.quaternion.clone(), axis, sign, weight, lag });
    }
    if (hasClip) {
      mixer = new THREE.AnimationMixer(obj);
      const a = mixer.clipAction(this.flySrc.clips[0]);
      a.play();
      a.time = this.rand() * a.getClip().duration;
    } else if (!wings.length) {
      flapUniforms = addShaderFlap(obj);
    }
    // fly head-first: the model stands upright (head +Y, belly +Z); lay it down so the head points +Z
    const holder = new THREE.Group();
    obj.rotation.x = Math.PI / 2;
    holder.add(obj);
    this.group.add(holder);
    return { obj: holder, wings, flap: this.rand() * 6.28, vel: new THREE.Vector3(), life: 0, phase: this.rand() * 6.28, flapUniforms, mixer };
  }

  /** A few pigeons circling high over the course, flapping and gliding. */
  addCircling(center: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      const f = this.makeFlyer();
      if (!f) return;
      f.life = Infinity;
      f.orbit = { center: center.clone(), r: 9 + this.rand() * 8, speed: 0.35 + this.rand() * 0.25, angle: this.rand() * 6.28, h: 10 + this.rand() * 6 };
      this.flyers.push(f);
    }
  }

  /** Scare every perched pigeon near `p`: it takes off as a flapping flyer and comes back later. */
  scatter(p: THREE.Vector3, radius = 4): void {
    for (const b of this.perched) {
      if (b.away > 0 || b.obj.position.distanceTo(p) > radius) continue;
      b.away = 9;
      b.obj.visible = false;
      const f = this.makeFlyer();
      if (!f) {
        b.away = 0;
        b.obj.visible = true;
        continue;
      }
      f.obj.position.copy(b.obj.position).add(new THREE.Vector3(0, 0.3, 0));
      const away = b.obj.position.clone().sub(p).setY(0).normalize();
      f.vel.set(away.x * 4 + 3 + this.rand() * 2, 5 + this.rand() * 2, away.z * 3 - 2 - this.rand() * 3);
      f.life = 6;
      this.flyers.push(f);
    }
  }

  update(dt: number, t: number, player: THREE.Vector3): void {
    for (const b of this.perched) {
      if (b.away > 0) {
        b.away -= dt;
        if (b.away <= 0) {
          b.obj.visible = true;
          b.obj.scale.setScalar(0.01);
        }
        continue;
      }
      // grow back in after landing, peck now and then
      const s = Math.min(1, b.obj.scale.x + dt * 2);
      b.obj.scale.setScalar(s);
      b.obj.rotation.x = Math.max(0, Math.sin(t * 2.3 + b.phase)) * 0.3;
      if (b.obj.position.distanceTo(player) < 3.5) this.scatter(b.obj.position, 1.5);
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      let flapRate = 15;
      if (f.orbit) {
        const o = f.orbit;
        o.angle += o.speed * dt;
        o.center.lerp(new THREE.Vector3(player.x + 6, player.y, player.z - 10), Math.min(1, dt * 0.3));
        const pos = new THREE.Vector3(o.center.x + Math.cos(o.angle) * o.r, o.center.y + o.h + Math.sin(o.angle * 2) * 1.2, o.center.z + Math.sin(o.angle) * o.r * 0.6);
        f.vel.subVectors(pos, f.obj.position).divideScalar(Math.max(dt, 1e-3));
        f.obj.position.copy(pos);
        // glide half the time
        flapRate = Math.sin(t * 0.7 + f.phase) > 0 ? 11 : 0;
      } else {
        f.life -= dt;
        f.vel.y += dt * 0.8;
        f.vel.x += dt * 1.5;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.life <= 0) {
          this.group.remove(f.obj);
          this.flyers.splice(i, 1);
          continue;
        }
      }
      // face the flight direction (model forward is +Z), bank into turns
      const yaw = Math.atan2(f.vel.x, f.vel.z);
      f.obj.rotation.set(-Math.atan2(f.vel.y, Math.hypot(f.vel.x, f.vel.z)) * 0.5, yaw, Math.sin(t * 1.3 + f.phase) * 0.25);
      if (f.mixer) f.mixer.update(flapRate > 0 ? dt * 1.4 : 0);
      if (f.wings.length) {
        f.flap = flapRate > 0 ? f.flap + dt * flapRate : f.flap + (Math.round(f.flap / (Math.PI * 2)) * Math.PI * 2 - 0.18 - f.flap) * Math.min(1, dt * 3);
        const q = new THREE.Quaternion();
        for (const w of f.wings) {
          const a = (Math.sin(f.flap - w.lag) * 0.85 + 0.15) * w.weight * w.sign;
          q.setFromAxisAngle(w.axis, a);
          w.bone.quaternion.copy(w.rest).multiply(q);
        }
      }
      for (const u of f.flapUniforms) u.value = flapRate > 0 ? u.value + dt * flapRate : u.value + (Math.round(u.value / Math.PI) * Math.PI - u.value) * Math.min(1, dt * 4);
    }
  }

  dispose(): void {
    this.group.clear();
    this.flyers = [];
    this.perched = [];
  }
}
