// Procedural stand-ins used only until (or if) the Tripo GLBs are not available.
import * as THREE from 'three';

function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
}

export function fallbackHeater(): THREE.Object3D {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.5, 14), mat(0xf4f1ea));
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 1.35, -0.35);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.1), mat(0x1e3b6e, { metalness: 0.4, roughness: 0.3 }));
  panel.position.set(0, 0.75, 0.25);
  panel.rotation.x = -0.6;
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), mat(0x777777, { metalness: 0.5 }));
  leg1.position.set(-0.7, 0.6, -0.35);
  const leg2 = leg1.clone();
  leg2.position.x = 0.7;
  g.add(tank, panel, leg1, leg2);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function fallbackTank(): THREE.Object3D {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 16), mat(0xd8cbb0));
  tank.position.y = 1.5;
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), mat(0x6b5a4a));
    leg.position.set(x, 0.35, z);
    g.add(leg);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), mat(0x555555));
  mast.position.set(0.9, 1.3, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), mat(0x555555));
  bar.position.set(0.9, 2.5, 0);
  g.add(tank, mast, bar);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function fallbackPigeon(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0x8f97a6));
  body.scale.set(1.3, 1, 1);
  body.position.y = 0.14;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0x5f7a6a));
  head.position.set(0.14, 0.26, 0);
  g.add(body, head);
  return g;
}
