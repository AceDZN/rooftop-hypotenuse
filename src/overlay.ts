// In-world scan overlay: right-triangle legs from the grapple hand to the targeted hook, a dashed
// hypotenuse marked "?", and DOM labels projected from 3D. It never shows the straight distance.
import * as THREE from 'three';

export interface OverlayLeg {
  from: THREE.Vector3;
  to: THREE.Vector3;
  label: string | null;
  dashed?: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Overlay {
  group = new THREE.Group();
  private solid: THREE.MeshBasicMaterial;
  private dash: THREE.MeshBasicMaterial;
  private dark: THREE.MeshBasicMaterial;
  /** world-units multiplier so lines keep a similar on-screen width at any camera distance */
  thickness = 1;
  private pool: THREE.Mesh[] = [];
  private used = 0;
  private geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  private labels: HTMLElement;
  private labelPool: HTMLElement[] = [];
  private labelUsed = 0;
  private reticle: HTMLElement;

  constructor(labelsRoot: HTMLElement) {
    this.labels = labelsRoot;
    this.solid = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
    this.dash = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
    this.dark = new THREE.MeshBasicMaterial({ color: 0x14302f, depthTest: false, transparent: true, opacity: 0.55 });
    this.group.renderOrder = 10;
    this.reticle = document.createElement('div');
    this.reticle.className = 'reticle';
    this.reticle.style.display = 'none';
    labelsRoot.appendChild(this.reticle);
  }

  begin(): void {
    this.used = 0;
    this.labelUsed = 0;
  }

  private seg(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, order = 11): void {
    let m = this.pool[this.used];
    if (!m) {
      m = new THREE.Mesh(this.geo, mat);
      m.frustumCulled = false;
      this.pool.push(m);
      this.group.add(m);
    }
    m.renderOrder = order;
    m.material = mat;
    m.visible = true;
    const d = new THREE.Vector3().subVectors(b, a);
    const l = d.length();
    m.scale.set(r, l, r);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    this.used++;
  }

  line(a: THREE.Vector3, b: THREE.Vector3, dashed = false, r = 0.035): void {
    r *= this.thickness;
    // dark outline underneath so white lines read over bright sky and plaster
    this.seg(a, b, r * 2.1, this.dark, 10);
    if (!dashed) {
      this.seg(a, b, r, this.solid);
      return;
    }
    const l = a.distanceTo(b);
    const dashLen = Math.max(0.45, 0.45 * this.thickness);
    const n = Math.max(2, Math.floor(l / dashLen));
    for (let i = 0; i < n; i += 2) {
      const p = a.clone().lerp(b, i / n);
      const q = a.clone().lerp(b, Math.min(1, (i + 1) / n));
      this.seg(p, q, r * 0.9, this.dash);
    }
  }

  /** Small square marking the right angle at `corner` between directions u and v. */
  rightAngle(corner: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, s = 0.45): void {
    s *= Math.max(1, this.thickness * 0.8);
    const a = corner.clone().addScaledVector(u, s);
    const b = corner.clone().addScaledVector(u, s).addScaledVector(v, s);
    const c = corner.clone().addScaledVector(v, s);
    this.line(a, b, false, 0.022);
    this.line(b, c, false, 0.022);
  }

  label(pos: THREE.Vector3, text: string, cls: string, camera: THREE.Camera, w: number, h: number, dx = 0, dy = 0): void {
    const p = pos.clone().project(camera);
    if (p.z > 1) return;
    let el = this.labelPool[this.labelUsed];
    if (!el) {
      el = document.createElement('div');
      this.labels.appendChild(el);
      this.labelPool.push(el);
    }
    el.className = `wl ${cls}`;
    el.textContent = text;
    el.style.display = '';
    el.style.left = `${((p.x + 1) / 2) * w + dx}px`;
    el.style.top = `${((1 - p.y) / 2) * h + dy}px`;
    this.labelUsed++;
  }

  setReticle(pos: THREE.Vector3 | null, camera: THREE.Camera, w: number, h: number): void {
    if (!pos) {
      this.reticle.style.display = 'none';
      return;
    }
    const p = pos.clone().project(camera);
    if (p.z > 1) {
      this.reticle.style.display = 'none';
      return;
    }
    this.reticle.style.display = '';
    this.reticle.style.left = `${((p.x + 1) / 2) * w}px`;
    this.reticle.style.top = `${((1 - p.y) / 2) * h}px`;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
    for (let i = this.labelUsed; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }
}
