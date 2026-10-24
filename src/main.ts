import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LEVELS, anchorOffset, anchorWorld, handOf, markById, type AnchorDef, type Level } from './levels.ts';
import { NO_INPUT, Sim, type Input } from './sim.ts';
import { buildWorld, type PropAssets, type World } from './world.ts';
import { Hero } from './hero.ts';
import { Overlay } from './overlay.ts';
import { Sfx } from './audio.ts';
import { fmt, hintTerms } from './rules.ts';
import { AutoPlayer } from './autoplay.ts';
import { fallbackHeater, fallbackPigeon, fallbackTank } from './fallbacks.ts';

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ui = {
  hud: $('hud'),
  timerText: $('timerText'),
  timerMedal: $('timerMedal'),
  levelChip: $('levelChip'),
  scan: $('scan'),
  scanLegs: $('scanLegs'),
  scanRope: $('scanRope'),
  scanExtra: $('scanExtra'),
  toast: $('toast'),
  prompt: $('prompt'),
  focus: $('focus'),
  focusFill: document.getElementById('focusFill') as unknown as SVGPathElement,
  hintBtn: $<HTMLButtonElement>('btnHint'),
  hintText: $('hintText'),
  muteBtn: $('btnMute'),
  explain: $('explain'),
  explainBadge: $('explainBadge'),
  explainMath: $('explainMath'),
  explainFoot: $('explainFoot'),
  touch: $('touch'),
  stick: $('stick'),
  knob: $('knob'),
  speed: $('speedlines'),
  vignette: $('vignette'),
  fade: $('fade'),
  intro: $('intro'),
  title: $('title'),
  results: $('results'),
  pause: $('pause'),
};

// ---------- persistent prefs / progress (best effort) ----------
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`rh:${k}`);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(`rh:${k}`, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};
type MedalKind = 'gold' | 'silver' | 'bronze';
const best: Record<string, { medal: MedalKind; time: number }> = store.get('best', {});
const prefs = store.get('prefs', { reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, mute: false });

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
const sfx = new Sfx();
sfx.muted = prefs.mute;

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('glLost').classList.remove('hidden');
});

// ---------- assets ----------
const assets: PropAssets = { heater: fallbackHeater(), tank: fallbackTank(), pigeon: fallbackPigeon() };
const hero = new Hero();
scene.add(hero.root);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const base = import.meta.env.BASE_URL;

function normalise(obj: THREE.Object3D, size: number, axis: 'y' | 'max'): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3();
  box.getSize(s);
  const k = size / (axis === 'y' ? s.y : Math.max(s.x, s.y, s.z));
  obj.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  const wrap = new THREE.Group();
  wrap.add(obj);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return wrap;
}

const assetStatus: Record<string, string> = {};
async function loadAssets(): Promise<void> {
  const load = (f: string) => loader.loadAsync(`${base}models/${f}`);
  const jobs: Promise<void>[] = [
    load('hero.glb')
      .then((g) => {
        hero.setModel(g.scene, g.animations);
        assetStatus.hero = `ok (${g.animations.map((a) => a.name).join(', ')})`;
      })
      .catch((e) => void (assetStatus.hero = `missing: ${e?.message ?? e}`)),
    load('solar-heater.glb')
      .then((g) => void ((assets.heater = normalise(g.scene, 2.4, 'max')), (assetStatus.heater = 'ok')))
      .catch(() => void (assetStatus.heater = 'missing')),
    load('water-tank.glb')
      .then((g) => void ((assets.tank = normalise(g.scene, 4.6, 'y')), (assetStatus.tank = 'ok')))
      .catch(() => void (assetStatus.tank = 'missing')),
    load('pigeon.glb')
      .then((g) => void ((assets.pigeon = normalise(g.scene, 0.34, 'y')), (assetStatus.pigeon = 'ok')))
      .catch(() => void (assetStatus.pigeon = 'missing')),
  ];
  await Promise.all(jobs);
}

// ---------- game state ----------
type Screen = 'title' | 'intro' | 'play' | 'paused' | 'results';
let screen: Screen = 'title';
let levelIdx = 0;
let level: Level = LEVELS[0];
let sim = new Sim(level);
let world: World | null = null;
const overlay = new Overlay($('labels'));
scene.add(overlay.group);
let targetId: string | null = null;
let hintOn = false;
let toastTimer = 0;
let explainTimer = 0;
let shake = 0;
let resultsTimer = -1;
let lastShort: { pos: THREE.Vector3; text: string; t: number } | null = null;
let auto: AutoPlayer | null = null;

const ropeMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  new THREE.MeshStandardMaterial({ color: 0xff9a35, emissive: 0xc65a10, emissiveIntensity: 0.6, roughness: 0.5 }),
);
ropeMesh.castShadow = true;
ropeMesh.visible = false;
scene.add(ropeMesh);

// dust puffs
const dustGeo = new THREE.SphereGeometry(1, 8, 6);
const dustMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 1, transparent: true, opacity: 0.9 });
const dust: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function puff(at: THREE.Vector3, n = 10, power = 2.5): void {
  if (prefs.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6));
    m.scale.setScalar(0.12 + Math.random() * 0.12);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    dust.push({ m, v: new THREE.Vector3(Math.cos(a) * power, 0.8 + Math.random() * 1.5, Math.sin(a) * power), life: 0.7 + Math.random() * 0.3 });
  }
}


/** Wrap formula runs inside Hebrew text in LTR isolates so "4² + 4² = 32 > 25" never flips. */
function ltrMath(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/([−\-(]?[0-9a-zA-Z√][0-9a-zA-Z²³√+\-−=≤≥≠×·().,:\s]*[0-9a-zA-Z²)]|&[lg]t;)/g, (m) => (/[0-9²]/.test(m) && m.trim().length > 1 ? `<bdi dir="ltr">${m.trim()}</bdi> ` : m));
}

// ---------- level management ----------
function loadLevel(i: number): void {
  levelIdx = i;
  level = LEVELS[i];
  if (world) {
    scene.remove(world.root);
    world.dispose();
  }
  world = buildWorld(level, assets, { shadows: true });
  scene.add(world.root);
  scene.fog = new THREE.Fog(level.night ? 0x1d2c5a : 0xf2b886, 60, 420);
  sim = new Sim(level);
  auto = null;
  targetId = null;
  hintOn = false;
  lastShort = null;
  resultsTimer = -1;
  camYaw = level.start.yaw;
  camPitch = 0.16;
  camPos.set(level.start.x - 7 * Math.cos(camYaw), 25, level.start.z - 7 * Math.sin(camYaw));
  ui.levelChip.textContent = `שלב ${level.num} • ${level.title}`;
  ui.hintBtn.disabled = !level.hints;
  ui.hintText.textContent = level.hints ? 'a² + b² = ?' : 'בלי רמזים';
  ui.explain.classList.add('hidden');
  ui.toast.classList.add('hidden');
  hero.update(0, sim, null);
}

function showIntro(): void {
  screen = 'intro';
  ui.title.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.intro.classList.remove('hidden');
  $('introKicker').textContent = `שלב ${level.num} מתוך ${LEVELS.length}${level.night ? ' · מבחן העברה' : ''}`;
  $('introTitle').textContent = level.title;
  $('introSub').innerHTML = ltrMath(level.subtitle);
  $('introGoal').innerHTML = ltrMath(level.goal);
  $('introRope').innerHTML = `אורך החבל <bdi dir="ltr">L = ${level.L}</bdi> מ׳`;
}

function startPlay(): void {
  ui.intro.classList.add('hidden');
  screen = 'play';
  sfx.unlock();
}

function startLevel(i: number): void {
  loadLevel(i);
  showIntro();
}

// ---------- input ----------
const keys = new Set<string>();
let firePressed = false;
let jumpPressed = false;
let focusHeld = false;
let mouse = { x: -1, y: -1, moved: false, down: false, dragging: false, sx: 0, sy: 0 };
let camYaw = 0;
let camPitch = 0.16;
let lastDragT = -10;
const stickVec = { x: 0, y: 0, id: -1 };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(e.code);
  sfx.unlock();
  if (screen === 'intro' && (k === 'enter' || k === ' ' || e.code.startsWith('Key') || e.code.startsWith('Arrow'))) {
    startPlay();
    if (k === ' ' || k === 'enter') return;
  }
  if (screen === 'results' && k === 'enter') return void nextLevel();
  if (screen !== 'play' && screen !== 'paused') return;
  if (e.code === 'Space') {
    jumpPressed = true;
    e.preventDefault();
  }
  if (k === 'e' || k === 'enter' || k === 'f') firePressed = true;
  if (k === 'shift') focusHeld = true;
  if (k === 'q' || k === 'tab') {
    cycleTarget();
    e.preventDefault();
  }
  if (k === 'h') toggleHint();
  if (k === 'm') toggleMute();
  if (k === 'r') restart();
  if (k === 'escape' || k === 'p') togglePause();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.key.toLowerCase() === 'shift') focusHeld = false;
});
window.addEventListener('blur', () => {
  keys.clear();
  focusHeld = false;
  if (screen === 'play') togglePause();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (screen === 'intro') return startPlay();
  if (e.pointerType === 'mouse' && e.button === 2) {
    focusHeld = true;
    return;
  }
  mouse = { ...mouse, down: true, dragging: false, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: true };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - mouse.x;
  const dy = e.clientY - mouse.y;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.moved = true;
  if (mouse.down && (mouse.dragging || Math.hypot(e.clientX - mouse.sx, e.clientY - mouse.sy) > 8)) {
    mouse.dragging = true;
    camYaw += dx * 0.006;
    camPitch = Math.max(-0.05, Math.min(0.9, camPitch + dy * 0.004));
    lastDragT = performance.now() / 1000;
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse' && e.button === 2) {
    focusHeld = false;
    return;
  }
  if (mouse.down && !mouse.dragging && screen === 'play') {
    const picked = pickAnchorAt(e.clientX, e.clientY, e.pointerType === 'mouse' ? 70 : 110);
    if (e.pointerType === 'mouse') {
      if (picked) targetId = picked;
      firePressed = true;
    } else if (picked) {
      targetId = picked;
      sfx.click();
    } else if (sim.state === 'swing') {
      firePressed = true; // tap anywhere to let go
    }
  }
  mouse.down = false;
  mouse.dragging = false;
});

// touch controls
function bindHold(el: HTMLElement, on: () => void, off: () => void = () => {}): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    el.classList.add('held');
    on();
  });
  const up = () => {
    el.classList.remove('held');
    off();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
bindHold($('tFire'), () => {
  if (screen === 'intro') startPlay();
  firePressed = true;
});
bindHold($('tJump'), () => {
  if (screen === 'intro') startPlay();
  jumpPressed = true;
});
bindHold(
  $('tFocus'),
  () => (focusHeld = true),
  () => (focusHeld = false),
);
ui.stick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (screen === 'intro') startPlay();
  stickVec.id = e.pointerId;
  ui.stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
ui.stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickVec.id) moveStick(e);
});
const endStick = (e: PointerEvent) => {
  if (e.pointerId !== stickVec.id) return;
  stickVec.id = -1;
  stickVec.x = 0;
  stickVec.y = 0;
  ui.knob.style.transform = '';
};
ui.stick.addEventListener('pointerup', endStick);
ui.stick.addEventListener('pointercancel', endStick);
function moveStick(e: PointerEvent): void {
  const r = ui.stick.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) {
    x /= l;
    y /= l;
  }
  stickVec.x = x;
  stickVec.y = y;
  ui.knob.style.transform = `translate(${x * 42}px, ${y * 42}px)`;
}

// buttons
$('btnPause').addEventListener('click', () => togglePause());
ui.muteBtn.addEventListener('click', () => toggleMute());
ui.hintBtn.addEventListener('click', () => toggleHint());
$('introGo').addEventListener('click', () => startPlay());
$('btnStart').addEventListener('click', () => {
  sfx.unlock();
  const firstOpen = LEVELS.findIndex((l) => !best[l.id]);
  startLevel(firstOpen < 0 ? 0 : firstOpen);
});
$('btnNext').addEventListener('click', () => nextLevel());
$('btnRetry').addEventListener('click', () => startLevel(levelIdx));
$('btnLevels').addEventListener('click', () => showTitle());
$('btnResume').addEventListener('click', () => togglePause());
$('btnRestart').addEventListener('click', () => {
  togglePause();
  restart();
});
$('btnPauseLevels').addEventListener('click', () => showTitle());
for (const id of ['optReduced', 'optReduced2']) {
  const el = $<HTMLInputElement>(id);
  el.checked = prefs.reduced;
  el.addEventListener('change', () => {
    prefs.reduced = el.checked;
    $<HTMLInputElement>('optReduced').checked = $<HTMLInputElement>('optReduced2').checked = el.checked;
    store.set('prefs', prefs);
  });
}
for (const id of ['optMute', 'optMute2']) {
  const el = $<HTMLInputElement>(id);
  el.checked = prefs.mute;
  el.addEventListener('change', () => {
    if (el.checked !== sfx.muted) toggleMute();
  });
}

function toggleMute(): void {
  sfx.setMuted(!sfx.muted);
  prefs.mute = sfx.muted;
  store.set('prefs', prefs);
  ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  $<HTMLInputElement>('optMute').checked = $<HTMLInputElement>('optMute2').checked = sfx.muted;
}
ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';

function toggleHint(): void {
  if (!level.hints) return;
  hintOn = !hintOn;
  ui.hintBtn.classList.toggle('on', hintOn);
  if (hintOn) {
    sim.hintsUsed++;
    sim.log.push({ level: level.id, t: sim.t, action: 'hint', anchor: targetId ?? undefined, hint: true });
  }
}

function togglePause(): void {
  if (screen === 'play') {
    screen = 'paused';
    ui.pause.classList.remove('hidden');
  } else if (screen === 'paused') {
    screen = 'play';
    ui.pause.classList.add('hidden');
  }
}

function restart(): void {
  sim.reset();
  targetId = null;
  hintOn = false;
  ui.hintBtn.classList.remove('on');
  ui.explain.classList.add('hidden');
  resultsTimer = -1;
  screen = 'play';
}

function nextLevel(): void {
  if (levelIdx < LEVELS.length - 1) startLevel(levelIdx + 1);
  else showTitle();
}

function showTitle(): void {
  screen = 'title';
  ui.pause.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.intro.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.title.classList.remove('hidden');
  renderLevelGrid();
}

function renderLevelGrid(): void {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    const rec = best[l.id];
    b.className = rec ? 'done' : '';
    b.innerHTML = `<span class="n">${l.num}</span><span>${l.title}</span>${rec ? `<span class="medal-ico ${rec.medal}"></span>` : '<span style="height:20px"></span>'}`;
    b.addEventListener('click', () => {
      sfx.unlock();
      startLevel(i);
    });
    grid.appendChild(b);
  });
}

// ---------- targeting ----------
function screenPos(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, behind: p.z > 1 };
}

function pickAnchorAt(x: number, y: number, radius: number): string | null {
  let bestId: string | null = null;
  let bestD = radius;
  for (const a of sim.candidates()) {
    const v = world?.anchors.get(a.id);
    if (!v) continue;
    const s = screenPos(v.pos);
    if (s.behind) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) {
      bestD = d;
      bestId = a.id;
    }
  }
  return bestId;
}

function cycleTarget(): void {
  const c = sim.candidates();
  if (!c.length) return;
  const sorted = [...c].sort((p, q) => screenPos(world!.anchors.get(q.id)!.pos).x - screenPos(world!.anchors.get(p.id)!.pos).x);
  const i = sorted.findIndex((a) => a.id === targetId);
  targetId = sorted[(i + 1) % sorted.length].id;
  sfx.click();
}

function updateTarget(): void {
  const c = sim.candidates();
  if (!c.length) {
    targetId = null;
    return;
  }
  if (c.length === 1) {
    targetId = c[0].id;
    return;
  }
  if (!isTouch && mouse.moved && !mouse.dragging && mouse.x >= 0) {
    const hov = pickAnchorAt(mouse.x, mouse.y, 90);
    if (hov) targetId = hov;
  }
  if (!targetId || !c.some((a) => a.id === targetId)) {
    // default: closest to the screen centre
    let bestD = Infinity;
    for (const a of c) {
      const s = screenPos(world!.anchors.get(a.id)!.pos);
      const d = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight * 0.42);
      if (d < bestD) {
        bestD = d;
        targetId = a.id;
      }
    }
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camFov = 62;

function updateCamera(dt: number): void {
  const p = sim.p;
  const head = new THREE.Vector3(p.x, p.y + 1.5, p.z);
  const now = performance.now() / 1000;
  const speed = Math.hypot(sim.vel.x, sim.vel.z);
  const userDragging = now - lastDragT < 1.5;
  let dist = 5.6;
  let height = 1.9;
  let look = head.clone();
  let fov = 62;
  const active = sim.activeMark();
  const tgt = targetId ? world?.anchors.get(targetId) : null;

  if (sim.state === 'ground' || sim.state === 'dash') {
    if (active && tgt && sim.markDistance(active) < 9) {
      // frame the runner and the hook together, looking along the plank
      const markYaw = Math.atan2(active.dir.z, active.dir.x);
      if (!userDragging) camYaw = lerpAngle(camYaw, markYaw + Math.atan2(tgt.def.dir.z, tgt.def.dir.x) * 0.35, dt * 2.2);
      look = head.clone().lerp(tgt.pos, 0.42);
      // tall hooks: back out and look at the middle of the scene instead of straight up
      const rise = tgt.pos.y - head.y;
      look.y = Math.min(look.y, head.y + 2.5);
      dist = 5.4 + Math.max(0, rise - 6) * 0.45;
      height = 1.2 + Math.max(0, rise - 6) * 0.35;
    } else if (speed > 2 && !userDragging) {
      camYaw = lerpAngle(camYaw, Math.atan2(sim.vel.z, sim.vel.x), dt * 1.6);
    }
  } else if (sim.state === 'swing' || sim.state === 'pull' || sim.state === 'rope') {
    dist = 6.8;
    height = 1.4;
    look = head.clone().add(new THREE.Vector3(sim.vel.x, 0, sim.vel.z).multiplyScalar(0.2));
    // three-quarter view so the arc reads as an arc
    if (!userDragging) camYaw = lerpAngle(camYaw, Math.atan2(sim.swingDir.z, sim.swingDir.x) - 0.55, dt * 2.5);
    fov = prefs.reduced ? 64 : 64 + Math.min(16, Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z) * 0.9);
  } else if (sim.state === 'air') {
    dist = 7;
    fov = prefs.reduced ? 62 : 62 + Math.min(10, speed * 0.6);
  } else if ((sim.state === 'miss' || sim.state === 'bounce' || sim.state === 'climb') && sim.awning) {
    // side-on shot of the drop, the striped awning and the climb back
    const w = sim.awning;
    const side = new THREE.Vector3(-w.dir.z, 0, w.dir.x);
    // pick the side with fewer poles in the way
    const poles = [...(world?.anchors.values() ?? [])].map((v) => v.pos);
    const blocked = (sgn: number) => poles.filter((p) => (p.x - w.x) * side.x * sgn + (p.z - w.z) * side.z * sgn > 2).length;
    const sgn = blocked(-1) <= blocked(1) ? -1 : 1;
    const want = new THREE.Vector3(w.x, w.top + 3.2, w.z).addScaledVector(side, 13 * sgn).addScaledVector(new THREE.Vector3(w.dir.x, 0, w.dir.z), 3);
    camPos.lerp(want, 1 - Math.exp(-dt * 4));
    camLook.lerp(head.clone().add(new THREE.Vector3(0, -1.6, 0)), 1 - Math.exp(-dt * 8));
    camFov += (54 - camFov) * Math.min(1, dt * 4);
    camera.fov = camFov;
    camera.position.copy(camPos);
    if (shake > 0 && !prefs.reduced) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    shake = Math.max(0, shake - dt * 2.5);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    camYaw = Math.atan2(w.dir.z, w.dir.x);
    return;
  } else if (sim.state === 'finished') {
    dist = 5;
    height = 1.4;
    camYaw += dt * 0.35;
  }

  const pitch = camPitch + (height - 2.3) * 0.05;
  const want = new THREE.Vector3(
    head.x - Math.cos(camYaw) * dist * Math.cos(pitch),
    head.y + height * 0.4 + Math.sin(pitch) * dist,
    head.z - Math.sin(camYaw) * dist * Math.cos(pitch),
  );
  // keep the camera out of buildings
  for (const b of level.boxes) {
    if (want.x > b.x0 - 0.4 && want.x < b.x1 + 0.4 && want.z > b.z0 - 0.4 && want.z < b.z1 + 0.4 && want.y < b.top + 1.2) want.y = b.top + 1.2;
  }
  const k = 1 - Math.exp(-dt * (sim.state === 'swing' ? 7 : 5));
  camPos.lerp(want, k);
  camLook.lerp(look, 1 - Math.exp(-dt * 8));
  camFov += (fov - camFov) * Math.min(1, dt * 4);
  camera.fov = camFov;
  camera.position.copy(camPos);
  if (shake > 0 && !prefs.reduced) {
    camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  }
  shake = Math.max(0, shake - dt * 2.5);
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// ---------- HUD ----------
function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function vLabel(b: number): string {
  return b < 0 ? `${fmt(-b)} מ׳ ↓` : `${fmt(b)} מ׳`;
}

function updateHud(dt: number): void {
  ui.timerText.textContent = fmtTime(sim.timer);
  const projected = sim.timer <= level.medal.gold && sim.falls === 0 ? 'gold' : sim.timer <= level.medal.silver ? 'silver' : 'bronze';
  ui.timerMedal.className = `medal-ico ${projected === 'gold' ? '' : projected}`;
  const scan = sim.scan();
  const entry = scan.find((e) => e.id === targetId);
  if (entry && (sim.state === 'ground' || sim.state === 'dash')) {
    ui.scan.classList.remove('hidden');
    const a = level.anchors.find((x) => x.id === entry.id)!;
    if (!level.scanLabels) {
      ui.scanLegs.innerHTML = `<span class="leg"><span class="arrow">↔</span> ? מ׳</span><span class="leg"><span class="arrow">↕</span> ? מ׳</span>`;
      ui.scanExtra.textContent = 'בלי מספרים: ספרו נורות ואריחים (כל אחד מטר)';
    } else if (a.xz) {
      ui.scanLegs.innerHTML = `<span class="leg">x <bdi dir="ltr">${fmt(Math.abs(a.xz.x))}</bdi> מ׳</span><span class="leg">z <bdi dir="ltr">${fmt(Math.abs(a.xz.z))}</bdi> מ׳</span><span class="leg"><span class="arrow">↕</span> <bdi dir="ltr">${vLabel(a.b)}</bdi></span>`;
      ui.scanExtra.textContent = 'פיתגורס במרחב: קודם על הרצפה, אחר כך באוויר';
    } else {
      ui.scanLegs.innerHTML = `<span class="leg"><span class="arrow">↔</span> <bdi dir="ltr">${fmt(entry.a)}</bdi> מ׳</span><span class="leg"><span class="arrow">↕</span> <bdi>${vLabel(a.b)}</bdi></span>`;
      ui.scanExtra.textContent = a.frame ? `זרוע השלט: ${a.frame.post} · ${a.frame.beam} · ${a.frame.brace} מ׳ — האם הזווית ישרה?` : '';
    }
    ui.scanRope.innerHTML = `חבל <bdi dir="ltr">L = ${level.L}</bdi> מ׳`;
    if (hintOn && level.hints) {
      const h = hintTerms(anchorOffset(a), level.L);
      ui.hintText.textContent = `${a.xz ? h.terms : `${fmt(entry.a)}² + ${fmt(Math.abs(a.b))}² = ?`}   ${h.target}`;
    }
  } else {
    ui.scan.classList.add('hidden');
    if (level.hints && !hintOn) ui.hintText.textContent = 'a² + b² = ?';
  }

  // prompts
  const active = sim.activeMark();
  let prompt = '';
  if (screen === 'play' && sim.state === 'ground') {
    if (active && sim.markDistance(active) > 7 && sim.candidates().length) prompt = 'רוצו אל הקרש עם העיגול הכתום';
    else if (active && targetId) prompt = isTouch ? 'הקישו על וו כדי לבחור · שיגור חבל' : 'עכבר: בחירת וו · קליק / E: שיגור · Q: וו אחר';
  } else if (sim.state === 'swing') prompt = isTouch ? 'הקישו כדי לשחרר מוקדם' : 'רווח: שחרור מוקדם';
  ui.prompt.textContent = prompt;
  ui.prompt.classList.toggle('hidden', !prompt || sim.timer > 25);

  // focus meter (arc length)
  const L = (ui.focusFill as SVGPathElement).getTotalLength?.() ?? 220;
  ui.focusFill.style.strokeDasharray = `${L}`;
  ui.focusFill.style.strokeDashoffset = `${L * (1 - sim.focus)}`;
  ui.focus.classList.toggle('active', sim.focusing);
  ui.vignette.style.opacity = sim.focusing && !prefs.reduced ? '1' : '0';

  const v = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
  ui.speed.style.opacity = prefs.reduced ? '0' : String(Math.max(0, Math.min(0.75, (v - 9) / 12)));

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) ui.toast.classList.add('hidden');
  }
  if (explainTimer > 0) {
    explainTimer -= dt;
    if (explainTimer <= 0) ui.explain.classList.add('hidden');
  }
}

function toast(html: string, cls = '', t = 1.8): void {
  ui.toast.innerHTML = html;
  ui.toast.className = cls;
  ui.toast.classList.remove('hidden');
  toastTimer = t;
}

function sqTerms(o: NonNullable<Sim['lastOutcome']>): string {
  if (o.x !== undefined && o.z !== undefined && o.x !== 0 && o.z !== 0) return `${fmt(Math.abs(o.x))}² + ${fmt(Math.abs(o.z))}² + ${fmt(Math.abs(o.b))}²`;
  const b = o.b < 0 ? `(${fmt(o.b)})²` : `${fmt(o.b)}²`;
  return `${fmt(o.a)}² + ${b}`;
}

function showExplain(kind: 'miss' | 'collapse'): void {
  const o = sim.lastOutcome;
  if (!o) return;
  ui.explain.classList.remove('ok', 'hidden');
  ui.explainBadge.textContent = '✕';
  if (kind === 'miss') {
    ui.explainMath.innerHTML = `<bdi dir="ltr">${sqTerms(o)} = ${fmt(o.sumSq)}</bdi><br><bdi dir="ltr"><span class="bad">${fmt(o.sumSq)}</span> &gt; ${fmt(o.Lsq)} = ${fmt(level.L)}²</bdi>`;
    ui.explainFoot.innerHTML = `החבל קצר מדי (חסר <bdi dir="ltr">${fmt(o.shortBy)}</bdi> מ׳) — מטפסים בחזרה… 🧗`;
  } else {
    const a = level.anchors.find((x) => x.id === o.anchorId)!;
    const f = a.frame!;
    ui.explainMath.innerHTML = `<bdi dir="ltr">${f.post}² + ${f.beam}² = ${f.post * f.post + f.beam * f.beam}</bdi><br><bdi dir="ltr">${f.brace}² = <span class="bad">${f.brace * f.brace}</span></bdi>`;
    ui.explainFoot.textContent = 'לא שווה, אז הזווית לא ישרה והזרוע התפרקה — מטפסים בחזרה… 🧗';
  }
  explainTimer = 3.4;
}

// ---------- results ----------
function showResults(): void {
  screen = 'results';
  const medal = sim.medal();
  const prev = best[level.id];
  const rank = { gold: 3, silver: 2, bronze: 1 } as const;
  if (!prev || rank[medal] > rank[prev.medal] || (medal === prev.medal && sim.timer < prev.time)) {
    best[level.id] = { medal, time: sim.timer };
    store.set('best', best);
  }
  sfx.medal(medal);
  $('resTitle').textContent = `שלב ${level.num} הושלם!`;
  const m = $('resMedal');
  m.className = `big-medal ${medal}`;
  m.textContent = medal === 'gold' ? '★★★' : medal === 'silver' ? '★★' : '★';
  $('resTime').textContent = fmtTime(sim.timer);
  $('resFalls').textContent = String(sim.falls);
  $('resHints').textContent = String(sim.hintsUsed);
  const ul = $('resLines');
  ul.innerHTML = '';
  const fires = sim.log.filter((e) => e.action === 'fire');
  for (const e of fires) {
    const a = level.anchors.find((x) => x.id === e.anchor)!;
    const li = document.createElement('li');
    const sum = a.xz ? a.xz.x ** 2 + a.xz.z ** 2 + a.b ** 2 : a.a ** 2 + a.b ** 2;
    const terms = a.xz ? `${Math.abs(a.xz.x)}² + ${Math.abs(a.xz.z)}² + ${Math.abs(a.b)}²` : `${fmt(a.a)}² + ${a.b < 0 ? `(${a.b})` : a.b}²`;
    const L2 = level.L * level.L;
    const ok = sum <= L2 && (!a.frame || a.frame.post ** 2 + a.frame.beam ** 2 === a.frame.brace ** 2);
    li.className = ok ? 'ok' : 'bad';
    if (a.frame) {
      const f = a.frame;
      li.innerHTML = `זרוע ${f.post}-${f.beam}-${f.brace}: <bdi dir="ltr">${f.post}² + ${f.beam}² ${f.post ** 2 + f.beam ** 2 === f.brace ** 2 ? '=' : '≠'} ${f.brace}²</bdi>`;
    } else {
      li.innerHTML = `<bdi dir="ltr">${terms} = ${sum} ${sum <= L2 ? '≤' : '>'} ${L2}</bdi>${a.note && !/[²]/.test(a.note) ? ` <small>· ${ltrMath(a.note)}</small>` : ''}`;
    }
    ul.appendChild(li);
  }
  $('resLesson').innerHTML = ltrMath(level.lesson);
  const next: string[] = [];
  if (medal !== 'gold') {
    if (sim.falls > 0) next.push('לזהב: בלי נפילות');
    if (sim.timer > level.medal.gold) next.push(`זמן מתחת ל־${level.medal.gold} שניות`);
    if (level.goldMark && !sim.usedMarks.includes(level.goldMark)) next.push('קפיצה מהסימן הרחוק ביותר שעדיין מגיע');
  }
  $('resNext').textContent = next.join(' · ');
  $('btnNext').textContent = levelIdx < LEVELS.length - 1 ? 'לשלב הבא ◀' : 'סיום — לשלבים';
  $('resChain').innerHTML = LEVELS.map((l, i) => `<span class="${best[l.id]?.medal ?? ''} ${i === levelIdx ? 'cur' : ''}">${l.num}</span>`).join('');
  ui.results.classList.remove('hidden');
  try {
    const all = store.get<unknown[]>('log', []);
    store.set('log', [...all, ...sim.log].slice(-500));
  } catch {
    /* ignore */
  }
}

// ---------- sim events → juice ----------
function handleEvents(): void {
  for (const ev of sim.events) {
    const pos = new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z);
    switch (ev) {
      case 'fire':
        sfx.fire();
        break;
      case 'attach': {
        sfx.attach();
        shake = 0.15;
        const o = sim.lastOutcome;
        if (o) toast(`<bdi dir="ltr">${sqTerms(o)} = ${fmt(o.sumSq)} ≤ ${fmt(o.Lsq)} ✓</bdi>`);
        break;
      }
      case 'short': {
        sfx.short();
        const o = sim.lastOutcome!;
        if (sim.ropeTip) lastShort = { pos: new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z), text: `חסר ${fmt(o.shortBy)} מ׳`, t: 2.6 };
        showExplain('miss');
        break;
      }
      case 'collapse':
        sfx.creak();
        shake = 0.35;
        showExplain('collapse');
        break;
      case 'awning':
        sfx.boing();
        hero.bounce();
        shake = 0.45;
        if (sim.awning) world?.bounceAwning(sim.awning.id);
        puff(pos, 14, 2.2);
        world?.scatterPigeons(pos);
        sfx.flap();
        break;
      case 'awning_small':
        hero.bounce();
        if (sim.awning) world?.bounceAwning(sim.awning.id);
        break;
      case 'release':
      case 'release_early':
      case 'pull_arrive':
        sfx.release();
        break;
      case 'land':
        sfx.land(false);
        puff(pos, 5, 1.2);
        break;
      case 'land_hard':
        sfx.land(true);
        hero.bounce();
        shake = 0.3;
        puff(pos, 12, 2.4);
        world?.scatterPigeons(pos);
        break;
      case 'jump':
        sfx.jump();
        break;
      case 'too_far':
        toast('רוצו אל הקרש עם העיגול הכתום', 'info', 1.4);
        break;
      case 'no_target':
        toast('כוונו לוו', 'info', 1.2);
        break;
      case 'fall_respawn':
        ui.fade.style.opacity = '1';
        setTimeout(() => (ui.fade.style.opacity = '0'), 450);
        break;
      case 'finish':
        resultsTimer = 1.6;
        puff(pos, 18, 3);
        world?.scatterPigeons(pos);
        break;
    }
  }
  sim.events.length = 0;
}

// ---------- per-frame ----------
function readInput(): Input {
  let fx = 0;
  let fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
  if (stickVec.id !== -1) {
    fx += stickVec.x;
    fz += -stickVec.y;
  }
  const fwd = { x: Math.cos(camYaw), z: Math.sin(camYaw) };
  const right = { x: -Math.sin(camYaw), z: Math.cos(camYaw) };
  let mx = fwd.x * fz + right.x * fx;
  let mz = fwd.z * fz + right.z * fx;
  const l = Math.hypot(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  const inp: Input = { moveX: mx, moveZ: mz, jump: jumpPressed, fire: firePressed, focus: focusHeld, targetId };
  if (sim.state === 'swing' && (jumpPressed || firePressed)) {
    inp.jump = true;
    inp.fire = true;
  }
  jumpPressed = false;
  firePressed = false;
  return inp;
}

function frame(dt: number): void {
  if (screen === 'play') {
    updateTarget();
    let inp = readInput();
    if (auto) {
      inp = auto.input();
      if (inp.targetId) targetId = inp.targetId;
    }
    const wasFocus = sim.focusing;
    sim.update(dt, inp);
    if (sim.focusing && !wasFocus) sfx.focusOn();
    handleEvents();
    if (resultsTimer > 0) {
      resultsTimer -= dt;
      if (resultsTimer <= 0) showResults();
    }
  } else if (screen === 'results' || screen === 'intro' || screen === 'title') {
    sim.update(0, NO_INPUT);
  }
  const simDt = sim.focusing ? dt * 0.15 : dt;
  const ropeTarget = sim.ropeTip ? new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z) : null;
  hero.update(simDt, sim, ropeTarget);
  if (screen === 'title') {
    camYaw += dt * 0.08;
  }
  updateCamera(dt);
  world?.update(simDt, performance.now() / 1000, sim, new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z));
  updateRope();
  updateOverlay();
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life -= dt;
    d.v.y -= dt * 2;
    d.m.position.addScaledVector(d.v, dt);
    d.m.scale.multiplyScalar(1 + dt * 1.5);
    (d.m.material as THREE.MeshStandardMaterial).opacity = Math.max(0, d.life);
    if (d.life <= 0) {
      scene.remove(d.m);
      (d.m.material as THREE.Material).dispose();
      dust.splice(i, 1);
    }
  }
  sfx.wind(Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z));
  updateHud(dt);
  renderer.render(scene, camera);
}

function updateRope(): void {
  if (!sim.ropeTip || sim.state === 'climb' || sim.state === 'bounce') {
    ropeMesh.visible = false;
    return;
  }
  const a = hero.hand.clone();
  const b = new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z);
  const d = b.clone().sub(a);
  const l = d.length();
  if (l < 0.05) {
    ropeMesh.visible = false;
    return;
  }
  ropeMesh.visible = true;
  ropeMesh.scale.set(0.045, l, 0.045);
  ropeMesh.position.copy(a).addScaledVector(d, 0.5);
  ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

function updateOverlay(): void {
  overlay.begin();
  const w = innerWidth;
  const h = innerHeight;
  const tgt = targetId ? world?.anchors.get(targetId) : null;
  const active = sim.activeMark();
  const showTri = !!(tgt && active && (sim.state === 'ground' || sim.state === 'dash') && screen !== 'title');
  overlay.setReticle(showTri && tgt ? tgt.pos : null, camera, w, h);
  if (showTri && tgt && active) {
    const hand = handOf(active);
    const H = new THREE.Vector3(hand.x, hand.y, hand.z);
    const A = tgt.pos.clone();
    const corner = new THREE.Vector3(A.x, H.y, A.z);
    const labels = level.scanLabels;
    const drawTri = labels || sim.focusing;
    if (drawTri) {
      const a = tgt.def;
      if (a.xz && a.xz.x !== 0 && a.xz.z !== 0) {
        // two-step: x leg, z leg on the floor plane, then the vertical leg
        const cx = new THREE.Vector3(A.x, H.y, H.z);
        overlay.line(H, cx);
        overlay.line(cx, corner);
        overlay.line(H, corner, true);
        overlay.line(corner, A);
        overlay.line(H, A, true);
        overlay.rightAngle(cx, new THREE.Vector3(-Math.sign(a.xz.x), 0, 0), new THREE.Vector3(0, 0, Math.sign(a.xz.z)));
        overlay.rightAngle(corner, H.clone().sub(corner).setY(0).normalize(), new THREE.Vector3(0, Math.sign(a.b), 0));
        if (labels) {
          overlay.label(H.clone().lerp(cx, 0.5), `${Math.abs(a.xz.x)} מ׳`, '', camera, w, h, 0, 18);
          overlay.label(cx.clone().lerp(corner, 0.5), `${Math.abs(a.xz.z)} מ׳`, '', camera, w, h, 0, 18);
          overlay.label(corner.clone().lerp(A, 0.5), `${Math.abs(a.b)} מ׳`, '', camera, w, h, 30, 0);
        }
      } else {
        overlay.line(H, corner);
        overlay.line(corner, A);
        overlay.line(H, A, true);
        overlay.rightAngle(corner, H.clone().sub(corner).normalize(), new THREE.Vector3(0, Math.sign(A.y - H.y) || 1, 0));
        if (labels) {
          overlay.label(H.clone().lerp(corner, 0.5), `${fmt(a.a)} מ׳`, '', camera, w, h, 0, 20);
          overlay.label(corner.clone().lerp(A, 0.5), `${fmt(Math.abs(a.b))} מ׳`, '', camera, w, h, 34, 0);
        }
      }
      if (labels) overlay.label(H.clone().lerp(A, 0.5), '?', 'q', camera, w, h, -16, -16);
    }
  }
  // anchor name tags so the recap and the scan can refer to them
  if (sim.state === 'ground' && active && screen === 'play') {
    for (const c of sim.candidates()) {
      const v = world?.anchors.get(c.id);
      if (!v || sim.candidates().length < 2) continue;
      overlay.label(v.pos, c.id.replace(/\d+$/, '') || c.id, 'tagname', camera, w, h, 0, -40);
    }
  }
  // bracket members (converse level)
  if (level.anchors.some((a) => a.frame) && screen === 'play') {
    for (const v of world?.anchors.values() ?? []) {
      if (!v.members || !v.def.frame || sim.brokenAnchor === v.def.id) continue;
      if (v.pos.distanceTo(new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z)) > 30) continue;
      for (const m of v.members) overlay.label(m.mid, m.text, 'member', camera, w, h);
    }
  }
  if (lastShort) {
    lastShort.t -= 1 / 60;
    overlay.label(lastShort.pos, lastShort.text, 'short', camera, w, h, 0, -34);
    if (lastShort.t <= 0) lastShort = null;
  }
  overlay.end();
}

// ---------- resize / loop ----------
function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
if (isTouch) {
  document.body.classList.add('touch');
  ui.touch.classList.remove('hidden');
}

let last = performance.now();
let manualTime = false;
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  if (!manualTime) frame(dt);
  requestAnimationFrame(loop);
}

// ---------- test hooks ----------
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __rh: Record<string, unknown>;
  }
}

window.render_game_to_text = () => {
  const scan = sim.scan();
  const o = sim.lastOutcome;
  return JSON.stringify({
    screen,
    level: level.id,
    title: level.title,
    L: level.L,
    player: {
      pos: { x: +sim.p.x.toFixed(2), y: +sim.p.y.toFixed(2), z: +sim.p.z.toFixed(2) },
      vel: { x: +sim.vel.x.toFixed(2), y: +sim.vel.y.toFixed(2), z: +sim.vel.z.toFixed(2) },
      state: sim.state,
      ground: sim.groundBox?.id ?? null,
    },
    activeMark: sim.activeMark()?.id ?? null,
    anchors: level.anchors.map((a) => {
      const s = scan.find((e) => e.id === a.id);
      const w = anchorWorld(level, a);
      return {
        id: a.id,
        mark: a.mark,
        a: +Math.sqrt(a.xz ? a.xz.x ** 2 + a.xz.z ** 2 : a.a * a.a).toFixed(3),
        b: a.b,
        x: a.xz?.x,
        z: a.xz?.z,
        reach: +Math.sqrt(a.xz ? a.xz.x ** 2 + a.xz.z ** 2 + a.b ** 2 : a.a ** 2 + a.b ** 2).toFixed(3),
        reachable: (a.xz ? a.xz.x ** 2 + a.xz.z ** 2 : a.a * a.a) + a.b * a.b <= level.L * level.L,
        holds: !a.frame || a.frame.post ** 2 + a.frame.beam ** 2 === a.frame.brace ** 2,
        inScan: !!s,
        targeted: a.id === targetId,
        world: { x: +w.x.toFixed(2), y: +w.y.toFixed(2), z: +w.z.toFixed(2) },
      };
    }),
    focus: +sim.focus.toFixed(2),
    focusing: sim.focusing,
    timer: +sim.timer.toFixed(2),
    falls: sim.falls,
    hintsUsed: sim.hintsUsed,
    medalNow: sim.medal(),
    finished: sim.finished,
    lastOutcome: o ? { kind: o.kind, anchor: o.anchorId, sumSq: o.sumSq, Lsq: o.Lsq, reach: +o.reach.toFixed(3), short_by_m: +o.shortBy.toFixed(3) } : null,
    objective: sim.finished ? 'level complete' : sim.activeMark() ? 'pick a hook in reach and fire' : 'run to the finish arch',
    assets: assetStatus,
    fps: +fps.toFixed(1),
  });
};

window.advanceTime = (ms: number) => {
  manualTime = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) frame(1 / 60);
};

window.__rh = {
  get sim() {
    return sim;
  },
  startLevel: (i: number) => {
    startLevel(i);
    startPlay();
  },
  setTarget: (id: string) => (targetId = id),
  fire: () => (firePressed = true),
  press: (code: string, down: boolean) => (down ? keys.add(code) : keys.delete(code)),
  realtime: () => (manualTime = false),
  teleportToMark: (id: string) => {
    const m = markById(level, id);
    sim.p = { x: m.x, y: m.top, z: m.z };
    sim.vel = { x: 0, y: 0, z: 0 };
    sim.state = 'ground';
  },
  anchors: (): AnchorDef[] => level.anchors,
  autoplay: (plan?: string[]) => (auto = plan === undefined ? new AutoPlayer(sim) : new AutoPlayer(sim, plan)),
  stopAuto: () => (auto = null),
};

// ---------- boot ----------
loadLevel(0);
showTitle();
requestAnimationFrame(loop);
loadAssets().then(() => {
  // rebuild the current world so props appear
  const keepScreen = screen;
  const keepSim = sim;
  if (world) {
    scene.remove(world.root);
    world.dispose();
  }
  world = buildWorld(level, assets, { shadows: true });
  scene.add(world.root);
  sim = keepSim;
  screen = keepScreen;
});
