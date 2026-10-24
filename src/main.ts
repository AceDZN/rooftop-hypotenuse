import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LEVELS, type Hook, type LevelSpec } from './levels.ts';
import { NO_INPUT, Sim, type Input, type Outcome } from './sim.ts';
import { buildWorld, type PropAssets, type World } from './world.ts';
import { Hero } from './hero.ts';
import { Overlay } from './overlay.ts';
import { Sfx } from './audio.ts';
import { fmt } from './rules.ts';
import { AutoPlayer, bestPolicy, wrongFirstPolicy } from './autoplay.ts';

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const labelsRoot = $('labels');
const ui = {
  hud: $('hud'),
  combo: $('combo'),
  comboText: $('comboText'),
  comboBar: $('comboBar'),
  stars: [$('st1'), $('st2'), $('st3')],
  levelChip: $('levelChip'),
  toast: $('toast'),
  coach: $('coach'),
  coachText: $('coachText'),
  starPop: $('starPop'),
  prompt: $('prompt'),
  hintBtn: $<HTMLButtonElement>('btnHint'),
  hintText: $('hintText'),
  muteBtn: $('btnMute'),
  explain: $('explain'),
  explainMath: $('explainMath'),
  explainFoot: $('explainFoot'),
  jumpBtn: $('jumpBtn'),
  speed: $('speedlines'),
  vignette: $('vignette'),
  flash: $('flash'),
  intro: $('intro'),
  title: $('title'),
  results: $('results'),
  pause: $('pause'),
};

// ---------- prefs / progress (best effort) ----------
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`rh2:${k}`);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(`rh2:${k}`, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};
const best: Record<string, number> = store.get('stars', {});
const prefs = store.get('prefs', { reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, mute: false });
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2500);
const sfx = new Sfx();
sfx.muted = prefs.mute;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('glLost').classList.remove('hidden');
});

// ---------- assets (Tripo GLBs) ----------
const assets: PropAssets = {};
const hero = new Hero();
scene.add(hero.root);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const base = import.meta.env.BASE_URL;
const assetStatus: Record<string, string> = {};

function normalise(obj: THREE.Object3D, size: number, axis: 'y' | 'max'): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3();
  box.getSize(s);
  obj.scale.setScalar(size / (axis === 'y' ? s.y : Math.max(s.x, s.y, s.z)));
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

async function loadAssets(): Promise<void> {
  const load = (f: string) => loader.loadAsync(`${base}models/${f}`);
  await Promise.all([
    load('hero.glb')
      .then((g) => {
        hero.setModel(g.scene, g.animations);
        assetStatus.hero = `ok: ${g.animations.map((a) => a.name).join(', ')}`;
      })
      .catch((e) => void (assetStatus.hero = `missing: ${e?.message ?? e}`)),
    load('solar-heater.glb')
      .then((g) => void ((assets.heater = normalise(g.scene, 2.6, 'max')), (assetStatus.heater = 'ok')))
      .catch(() => void (assetStatus.heater = 'missing')),
    load('water-tank.glb')
      .then((g) => void ((assets.tank = normalise(g.scene, 4.4, 'y')), (assetStatus.tank = 'ok')))
      .catch(() => void (assetStatus.tank = 'missing')),
    load('pigeon-flying.glb')
      .then((g) => {
        // wingspan about 0.75 m; keep the skinned scene intact for cloning
        const box = new THREE.Box3().setFromObject(g.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        g.scene.scale.setScalar(0.75 / Math.max(size.x, size.z));
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.frustumCulled = false;
          }
        });
        assets.flyer = { scene: g.scene, clips: g.animations };
        assetStatus.pigeonFlying = `ok (${g.animations.length} clips, bones flapped in code)`;
      })
      .catch(() => void (assetStatus.pigeonFlying = 'missing')),
    load('pigeon.glb')
      .then((g) => void ((assets.pigeon = normalise(g.scene, 0.42, 'y')), (assetStatus.pigeon = 'ok')))
      .catch(() => void (assetStatus.pigeon = 'missing')),
  ]);
}

// ---------- state ----------
type Screen = 'title' | 'intro' | 'play' | 'paused' | 'results';
let screen: Screen = 'title';
let levelIdx = 0;
let level: LevelSpec = LEVELS[0];
let sim = new Sim(level);
let world: World | null = null;
const overlay = new Overlay(labelsRoot);
scene.add(overlay.group);
let hoverId: string | null = null;
let hintOn = false;
let toastT = 0;
let explainT = 0;
let starPopT = 0;
let shake = 0;
let resultsT = -1;
let auto: AutoPlayer | null = null;
let shortTag: { pos: THREE.Vector3; text: string; t: number } | null = null;
let pendingHook: string | null = null;
let pendingJump = false;
let pendingTile: number | null = null;
let debugCam: { pos: THREE.Vector3; look: THREE.Object3D } | null = null;
let hoverTile: number | null = null;
const coached = new Set<string>();

const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1), new THREE.MeshStandardMaterial({ color: 0xff9a35, emissive: 0xc65a10, emissiveIntensity: 0.7, roughness: 0.5 }));
ropeMesh.visible = false;
scene.add(ropeMesh);

const dustGeo = new THREE.SphereGeometry(1, 8, 6);
const dust: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function puff(at: THREE.Vector3, n = 10, power = 2.5): void {
  if (prefs.reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(dustGeo, new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 1, transparent: true, opacity: 0.9 }));
    m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6));
    m.scale.setScalar(0.14 + Math.random() * 0.12);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    dust.push({ m, v: new THREE.Vector3(Math.cos(a) * power, 0.8 + Math.random() * 1.5, Math.sin(a) * power * 0.5), life: 0.7 + Math.random() * 0.3 });
  }
}

/** Wrap formula runs in LTR isolates inside Hebrew text. */
function ltrMath(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/([−\-(]?[0-9a-zA-Z√][0-9a-zA-Z²³√+\-−=≤≥≠×·().,:\s]*[0-9a-zA-Z²)]|&[lg]t;)/g, (m) => (/[0-9²]/.test(m) && m.trim().length > 1 ? `<bdi dir="ltr">${m.trim()}</bdi> ` : m));
}

function showCoach(text: string): void {
  ui.coachText.innerHTML = ltrMath(text);
  ui.coach.classList.remove('hidden');
}
function hideCoach(): void {
  ui.coach.classList.add('hidden');
}
$('coachOk').addEventListener('click', (e) => {
  e.stopPropagation();
  hideCoach();
});

// ---------- levels ----------
function loadLevel(i: number): void {
  levelIdx = i;
  level = LEVELS[i];
  sim = new Sim(level);
  auto = null;
  if (world) {
    scene.remove(world.root);
    world.dispose();
  }
  world = buildWorld(sim.course, assets);
  scene.add(world.root);
  scene.fog = new THREE.Fog(level.night ? 0x1d2c5a : 0xf2b886, 90, 520);
  hintOn = false;
  shortTag = null;
  resultsT = -1;
  ui.levelChip.textContent = `שלב ${level.num} • ${level.title}`;
  ui.hintBtn.disabled = !level.hints;
  ui.hintBtn.classList.remove('on');
  ui.hintText.textContent = level.hints ? 'רמז' : 'בלי רמזים';
  ui.explain.classList.add('hidden');
  ui.toast.classList.add('hidden');
  hideCoach();
  coached.clear();
  camPos.set(sim.p.x + 2, sim.p.y + 4, sim.p.z + 18);
  camLook.set(sim.p.x + 4, sim.p.y + 1.5, sim.p.z);
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
  const grid = $('levelGrid');
  grid.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    const st = best[l.id] ?? 0;
    b.className = st ? 'done' : '';
    b.innerHTML = `<span class="n">${l.num}</span><span>${l.title}</span><span class="lv-stars">${'★'.repeat(st)}<span class="dim">${'★'.repeat(3 - st)}</span></span>`;
    b.addEventListener('click', () => {
      sfx.unlock();
      startLevel(i);
    });
    grid.appendChild(b);
  });
}

function restart(): void {
  loadLevel(levelIdx);
  screen = 'play';
  ui.pause.classList.add('hidden');
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

function toggleMute(): void {
  sfx.setMuted(!sfx.muted);
  prefs.mute = sfx.muted;
  store.set('prefs', prefs);
  ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  $<HTMLInputElement>('optMute').checked = $<HTMLInputElement>('optMute2').checked = sfx.muted;
}

function toggleHint(): void {
  if (!level.hints) return;
  hintOn = !hintOn;
  ui.hintBtn.classList.toggle('on', hintOn);
  if (hintOn) {
    sim.hintsUsed++;
    sim.log.push({ level: level.id, t: sim.t, action: 'hint', decision: sim.decision?.id, hint: true });
  }
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (screen === 'intro' && (k === 'enter' || k === ' ')) {
    e.preventDefault();
    return startPlay();
  }
  if (screen === 'results' && k === 'enter') return nextLevel();
  if (k === 'escape' || k === 'p') return togglePause();
  if (screen !== 'play') return;
  if (k === ' ' || k === 'arrowup' || k === 'w') {
    pendingJump = true;
    e.preventDefault();
  }
  if (sim.state === 'strip' && k >= '0' && k <= '9') {
    pendingTile = k === '0' ? 10 : Number(k);
  } else if (k >= '1' && k <= '3') {
    const hk = sim.choices().find((h) => h.num === Number(k));
    if (hk) pendingHook = hk.id;
  }
  if (k === 'h') toggleHint();
  if (k === 'm') toggleMute();
  if (k === 'r') restart();
});
window.addEventListener('blur', () => {
  if (screen === 'play') togglePause();
});

function screenOf(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, behind: p.z > 1 };
}

/** Strip tile under a screen point (tiles ahead of the runner only). */
function tileAt(x: number, y: number, radius: number): number | null {
  const d = sim.decision;
  if (!d?.strip || sim.state !== 'strip') return null;
  let best: number | null = null;
  let bestD = radius;
  for (let n = 1; n <= 10; n++) {
    const tx = d.strip.foot - n;
    if (tx < sim.p.x - 0.01) continue;
    const s = screenOf(new THREE.Vector3(tx, d.strip.top, d.P.z + 0.4));
    const dd = Math.hypot(s.x - x, s.y - y);
    if (dd < bestD) {
      bestD = dd;
      best = n;
    }
  }
  return best;
}

function hookAt(x: number, y: number, radius: number): Hook | null {
  let bestH: Hook | null = null;
  let bestD = radius;
  for (const hk of sim.choices()) {
    const s = screenOf(new THREE.Vector3(hk.pos.x, hk.pos.y, hk.pos.z));
    if (s.behind) continue;
    // the badge + tag sit above the hook: count them as part of the target
    const d = Math.min(Math.hypot(s.x - x, s.y - y), Math.hypot(s.x - x, s.y - 60 - y));
    if (d < bestD) {
      bestD = d;
      bestH = hk;
    }
  }
  return bestH;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  hoverId = hookAt(e.clientX, e.clientY, 110)?.id ?? null;
  hoverTile = tileAt(e.clientX, e.clientY, 60);
  canvas.style.cursor = hoverId || hoverTile ? 'pointer' : 'default';
});
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (screen === 'intro') return startPlay();
  if (screen !== 'play') return;
  hideCoach();
  if (sim.state === 'decide') {
    const hk = hookAt(e.clientX, e.clientY, isTouch ? 140 : 110);
    if (hk) pendingHook = hk.id;
    return;
  }
  if (sim.state === 'strip') {
    const t = tileAt(e.clientX, e.clientY, isTouch ? 70 : 60);
    if (t) {
      pendingTile = t;
      return;
    }
  }
  // anywhere else: jump on strips, let go early (flip) while swinging
  pendingJump = true;
});
ui.jumpBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  sfx.unlock();
  pendingJump = true;
});

$('btnPause').addEventListener('click', () => togglePause());
ui.muteBtn.addEventListener('click', () => toggleMute());
ui.hintBtn.addEventListener('click', () => toggleHint());
$('introGo').addEventListener('click', () => startPlay());
ui.intro.addEventListener('pointerdown', () => {
  sfx.unlock();
  startPlay();
});
$('btnStart').addEventListener('click', () => {
  sfx.unlock();
  const first = LEVELS.findIndex((l) => !best[l.id]);
  startLevel(first < 0 ? 0 : first);
});
$('btnNext').addEventListener('click', () => nextLevel());
$('btnRetry').addEventListener('click', () => startLevel(levelIdx));
$('btnLevels').addEventListener('click', () => showTitle());
$('btnResume').addEventListener('click', () => togglePause());
$('btnRestart').addEventListener('click', () => restart());
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
ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';

// ---------- camera (side view) ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt: number): void {
  const p = new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z);
  let look = p.clone().add(new THREE.Vector3(4, 1.4, 0));
  let dist = 17;
  let height = 3;
  let yaw = 0;
  let follow = 4;
  const d = sim.decision;
  if (d && (sim.state === 'decide' || sim.state === 'rope' || sim.state === 'leap' || sim.state === 'miss' || sim.state === 'bounce')) {
    // frame the decision point and every hook
    const pts = [d.P, ...d.hooks.map((h) => h.pos)];
    for (const hk of d.hooks) if (hk.spec.frame) pts.push({ x: hk.pos.x + 5, y: hk.pos.y - 3, z: hk.pos.z });
    if (sim.state === 'miss' || sim.state === 'bounce') pts.push({ x: d.P.x, y: d.canopy.top, z: d.P.z });
    const minX = Math.min(...pts.map((q) => q.x)) - 2.5;
    const maxX = Math.max(...pts.map((q) => q.x));
    const minY = Math.min(...pts.map((q) => q.y)) - 3.2;
    const maxY = Math.max(...pts.map((q) => q.y)) + 3.6;
    const aspect = innerWidth / innerHeight;
    const w = maxX - minX + 6;
    const h = maxY - minY + 1;
    const fovV = (camera.fov * Math.PI) / 180;
    const needH = Math.max(h, w / aspect);
    dist = Math.max(9, needH / 2 / Math.tan(fovV / 2));
    look = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (d.P.z + Math.max(...pts.map((q) => q.z))) / 2);
    height = d.camYaw ? dist * 0.42 : 1;
    yaw = d.camYaw;
    follow = 3;
  } else if (d && d.kind === 'strip' && sim.state === 'strip') {
    const s = d.strip!;
    const hookY = d.hooks[0].pos.y;
    const fovV = (camera.fov * Math.PI) / 180;
    const needH = Math.max(hookY - s.top + 12, (s.foot - sim.p.x + 8) / (innerWidth / innerHeight));
    look = new THREE.Vector3((sim.p.x + s.foot) / 2 + 1, (s.top + hookY) / 2 + 1.5, d.P.z);
    dist = Math.max(14, needH / 2 / Math.tan(fovV / 2));
    height = 1;
  } else if (sim.state === 'swing' || sim.state === 'pull' || sim.state === 'fly') {
    look = p.clone().add(new THREE.Vector3(sim.vel.x * 0.25 + 2, 1, 0));
    dist = 20;
    height = 2;
    yaw = sim.decision?.camYaw ?? 0;
    follow = 6;
  } else if (sim.state === 'climb') {
    look = p.clone().add(new THREE.Vector3(2, 2, 0));
    dist = 14;
  } else if (sim.state === 'finished') {
    look = p.clone().add(new THREE.Vector3(1.5, 1.6, 0));
    dist = 7;
    height = 1.6;
    yaw = 1.05;
    follow = 3;
  }
  // final stretch: swing behind the runner so the finish arch faces both the runner and the player
  const fin = sim.course.finish;
  if (sim.state === 'run' && sim.nextEvent?.type === 'finish' && fin.x - sim.p.x < 30) {
    look = new THREE.Vector3(Math.min(fin.x, sim.p.x + 6), sim.p.y + 2, sim.p.z);
    dist = 10;
    height = 3;
    yaw = 1.05;
    follow = 3;
  }
  const off = new THREE.Vector3(Math.sin(yaw) * -dist, height, Math.cos(yaw) * dist);
  const want = look.clone().add(off);
  const k = 1 - Math.exp(-dt * follow);
  camPos.lerp(want, k);
  camLook.lerp(look, 1 - Math.exp(-dt * (follow + 2)));
  camera.position.copy(camPos);
  if (shake > 0 && !prefs.reduced) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  shake = Math.max(0, shake - dt * 2.5);
  camera.lookAt(camLook);
}

// ---------- HUD ----------
function sq(n: number): string {
  return n < 0 ? `(${fmt(n)})²` : `${fmt(n)}²`;
}

function outcomeTerms(o: Outcome): string {
  if (o.x !== undefined && o.z !== undefined && o.z !== 0) return `${sq(o.x)} + ${sq(o.z)} + ${sq(o.b)}`;
  return `${sq(o.a)} + ${sq(o.b)}`;
}

function toast(html: string, t = 1.6): void {
  ui.toast.innerHTML = html;
  ui.toast.className = '';
  toastT = t;
}

function showExplain(o: Outcome): void {
  ui.explain.classList.remove('hidden');
  if (o.kind === 'miss') {
    ui.explainMath.innerHTML = `<bdi dir="ltr">${outcomeTerms(o)} = ${fmt(o.sumSq)}</bdi><br><bdi dir="ltr"><span class="bad">${fmt(o.sumSq)}</span> &gt; ${fmt(o.Lsq)} = ${fmt(level.L)}²</bdi>`;
    ui.explainFoot.innerHTML = o.tile !== undefined ? `מהמספר <bdi dir="ltr">${o.tile}</bdi> החבל לא מגיע. קופצים קרוב יותר!` : `החבל קצר מדי (חסר <bdi dir="ltr">${fmt(o.shortBy)}</bdi> מ׳). בחרו וו אחר!`;
  } else {
    const f = o.frame!;
    ui.explainMath.innerHTML = `<bdi dir="ltr">${f.post}² + ${f.beam}² = ${f.post ** 2 + f.beam ** 2}</bdi><br><bdi dir="ltr">${f.brace}² = <span class="bad">${f.brace ** 2}</span></bdi>`;
    ui.explainFoot.textContent = 'לא שווה, אז הזווית לא ישרה והזרוע התפרקה.';
  }
  explainT = 3.2;
}

function updateHud(dt: number): void {
  ui.comboText.textContent = `x${sim.combo}`;
  ui.comboBar.style.width = `${Math.min(1, sim.combo / 8) * 100}%`;
  ui.combo.classList.toggle('hot', sim.combo >= 3);
  const st = sim.stars();
  ui.stars.forEach((el, i) => el.classList.toggle('on', i < st));
  const strip = sim.state === 'strip';
  ui.jumpBtn.classList.toggle('hidden', !strip || screen !== 'play' || sim.stripTarget !== null);
  let prompt = '';
  if (screen === 'play') {
    if (sim.state === 'decide') prompt = level.labels ? (isTouch ? 'הקישו על הוו שהחבל מגיע אליו' : 'לחצו על הוו שהחבל מגיע אליו (או 1 2 3)') : 'ספרו נורות: כל נורה מטר';
    else if (strip) prompt = sim.stripWaiting ? 'הקישו על מספר על הפיגום: משם תקפצו' : sim.stripTarget ? `רצים למספר ${sim.stripTarget}…` : 'קפיצה! (או הקישו על מספר)';
  }
  ui.prompt.textContent = prompt;
  ui.prompt.classList.toggle('hidden', !prompt);
  ui.vignette.style.opacity = sim.state === 'decide' && !prefs.reduced ? '0.85' : '0';
  const v = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
  ui.speed.style.opacity = prefs.reduced ? '0' : String(Math.max(0, Math.min(0.7, (v - 10) / 10)));
  if (toastT > 0 && (toastT -= dt) <= 0) ui.toast.classList.add('hidden');
  if (explainT > 0 && (explainT -= dt) <= 0) ui.explain.classList.add('hidden');
  if (starPopT > 0 && (starPopT -= dt) <= 0) ui.starPop.classList.add('hidden');
}

function legsLabel(hk: Hook): string {
  const s = hk.spec;
  if (!level.labels) return '↔ ספרו נורות<br>↕ ספרו נורות';
  if (s.frame) {
    const f = s.frame;
    let html = `<span>✓ בטווח</span><br>זרוע: <bdi dir="ltr">${f.post} · ${f.beam} · ${f.brace}</bdi>`;
    if (hintOn) html += `<span class="hint"><bdi dir="ltr">${f.post}² + ${f.beam}² = ? · ${f.brace}² = ?</bdi></span>`;
    return html;
  }
  const up = s.b < 0 ? `${-s.b} מ׳ ↓` : `${s.b} מ׳ ↕`;
  if (s.z !== undefined && s.z !== 0) return `<bdi dir="ltr">x ${s.a} · z ${s.z}</bdi><br>${up}`;
  let html = `${s.a} מ׳ ↔<br>${up}`;
  if (hintOn) html += `<span class="hint"><bdi dir="ltr">${s.z !== undefined && s.z !== 0 ? `${s.a}² + ${s.z}² + ${Math.abs(s.b)}²` : `${s.a}² + ${Math.abs(s.b)}²`} = ?</bdi></span>`;
  return html;
}

// hook tags are separate DOM elements (badge + legs card), pooled per hook id
const tagEls = new Map<string, HTMLElement>();
function updateTags(): void {
  const d = sim.decision;
  const show = !!d && d.kind === 'hooks' && (sim.state === 'decide' || sim.state === 'rope' || sim.state === 'leap' || sim.state === 'miss' || sim.state === 'bounce') && screen !== 'title';
  const live = new Set<string>();
  if (show && d) {
    // spread tags so close hooks (1 m apart) never overlap: keep a minimum on-screen gap
    const placed = d.hooks
      .map((hk) => ({ hk, s: screenOf(new THREE.Vector3(hk.pos.x, hk.pos.y + 0.9, hk.pos.z)) }))
      .sort((p, q) => p.s.x - q.s.x);
    const gap = innerWidth < 700 ? 74 : 96;
    for (let i = 1; i < placed.length; i++) if (placed[i].s.x - placed[i - 1].s.x < gap) placed[i].s.x = placed[i - 1].s.x + gap;
    const shift = (placed[placed.length - 1].s.x + placed[0].s.x) / 2 - (screenOf(new THREE.Vector3(placed[placed.length - 1].hk.pos.x, 0, 0)).x + screenOf(new THREE.Vector3(placed[0].hk.pos.x, 0, 0)).x) / 2;
    for (const { hk, s } of placed) {
      live.add(hk.id);
      let el = tagEls.get(hk.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hooktag';
        labelsRoot.appendChild(el);
        tagEls.set(hk.id, el);
      }
      el.style.left = `${s.x - shift}px`;
      el.style.top = `${Math.max(innerHeight < 500 ? 46 : 64, Math.min(...placed.map((q) => q.s.y)) - 100)}px`;
      el.classList.toggle('used', sim.tried.has(hk.id));
      el.classList.toggle('focus', hoverId === hk.id);
      const html = `<div class="num c${hk.num}">${hk.num}</div><div class="legs">${legsLabel(hk)}</div>`;
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
      }
    }
  }
  for (const [id, el] of tagEls) el.style.display = live.has(id) ? '' : 'none';
}

function updateOverlay(): void {
  overlay.begin();
  const w = innerWidth;
  const h = innerHeight;
  const d = sim.decision;
  if (d && d.kind === 'hooks' && sim.state === 'decide' && screen === 'play') {
    const H = new THREE.Vector3(d.P.x, d.P.y, d.P.z);
    // keep about the same on-screen line width however far the camera framed the gap
    overlay.thickness = Math.max(1, (camera.position.distanceTo(H) / 16) * (innerHeight < 500 ? 1.5 : 1));
    overlay.label(H.clone().add(new THREE.Vector3(0, -1.4, 0)), `L = ${level.L}`, 'gauntlet', camera, w, h);
    {
      for (const hk of sim.choices()) {
        const A = new THREE.Vector3(hk.pos.x, hk.pos.y, hk.pos.z);
        const corner = new THREE.Vector3(A.x, H.y, A.z);
        const focus = (hoverId === hk.id || sim.choices().length === 1) && level.labels;
        const r = !level.labels ? 0.025 : focus ? 0.07 : isTouch ? 0.05 : 0.04;
        if (hk.spec.z) {
          // space: x leg, z leg on the floor (dashed diagonal), then up to the hook
          const cx = new THREE.Vector3(A.x, H.y, H.z);
          overlay.line(H, cx, false, r);
          overlay.line(cx, corner, false, r);
          overlay.line(H, corner, true, r * 0.8);
          overlay.line(corner, A, false, r);
          overlay.line(H, A, true, r);
          if (focus) {
            overlay.label(H.clone().lerp(cx, 0.5), `x ${hk.spec.a}`, '', camera, w, h, 0, 16);
            overlay.label(cx.clone().lerp(corner, 0.5), `z ${hk.spec.z}`, '', camera, w, h, 16, 10);
            overlay.label(corner.clone().lerp(A, 0.5), `↕ ${hk.spec.b}`, '', camera, w, h, 30, 0);
            overlay.label(H.clone().lerp(A, 0.5), '?', 'q', camera, w, h, -18, -18);
          }
          continue;
        }
        overlay.line(H, corner, false, r);
        overlay.line(corner, A, false, r);
        overlay.line(H, A, true, r);
        overlay.rightAngle(corner, H.clone().sub(corner).normalize(), new THREE.Vector3(0, Math.sign(A.y - H.y) || 1, 0), focus ? 0.55 : 0.4);
        if (focus) {
          overlay.label(H.clone().lerp(corner, 0.5), `${fmt(Math.sqrt(hk.h2))} מ׳`, '', camera, w, h, 0, 18);
          overlay.label(corner.clone().lerp(A, 0.5), `${fmt(Math.abs(hk.spec.b))} מ׳`, '', camera, w, h, 32, 0);
          overlay.label(H.clone().lerp(A, 0.5), '?', 'q', camera, w, h, -18, -18);
        }
      }
    }
    // bracket side lengths (converse level)
    for (const hk of d.hooks) {
      const v = world?.hooks.get(hk.id);
      if (v?.members) for (const m of v.members) overlay.label(m.mid, m.text, hk.holds ? 'member' : 'member bad', camera, w, h);
    }
  }
  if (d && d.kind === 'strip' && (sim.state === 'strip' || sim.state === 'rope') && screen === 'play') {
    const st = d.strip!;
    const hk = d.hooks[0];
    const A = new THREE.Vector3(hk.pos.x, hk.pos.y, hk.pos.z);
    overlay.label(A.clone().add(new THREE.Vector3(1.6, -0.6, 0)), level.labels ? `↕ ${st.b} מ׳` : '↕ ?', 'gauntlet', camera, w, h);
    const head = new THREE.Vector3(sim.p.x, sim.p.y + 2.3, sim.p.z);
    if (sim.state === 'strip') {
      const n = hoverTile ?? sim.stripTarget ?? sim.stripTile;
      const Hn = new THREE.Vector3(st.foot - n, st.top + 1, d.P.z);
      const corner = new THREE.Vector3(A.x, Hn.y, A.z);
      overlay.thickness = Math.max(1, camera.position.distanceTo(A) / 16);
      overlay.line(Hn, corner, false, 0.06);
      overlay.line(corner, A, false, 0.06);
      overlay.line(Hn, A, true, 0.06);
      overlay.rightAngle(corner, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), 0.55);
      overlay.label(Hn.clone().lerp(corner, 0.5), level.labels ? `↔ ${n} מ׳` : '↔ ?', 'short', camera, w, h, 0, 22);
      overlay.label(Hn.clone().lerp(A, 0.5), '?', 'q', camera, w, h, -18, -18);
      if (!sim.stripWaiting) overlay.label(head, `${sim.stripTile}`, 'gauntlet', camera, w, h);
    }
    overlay.label(new THREE.Vector3(sim.p.x, sim.p.y - 0.9, sim.p.z), `L = ${level.L}`, 'gauntlet', camera, w, h);
  }
  if (shortTag) {
    overlay.label(shortTag.pos, shortTag.text, 'short', camera, w, h, 0, -34);
    if ((shortTag.t -= 1 / 60) <= 0) shortTag = null;
  }
  overlay.end();
  updateTags();
}

// ---------- results ----------
function showResults(): void {
  screen = 'results';
  const stars = sim.stars();
  if (stars > (best[level.id] ?? 0)) {
    best[level.id] = stars;
    store.set('stars', best);
  }
  const medal = stars === 3 ? 'gold' : stars === 2 ? 'silver' : 'bronze';
  sfx.medal(medal);
  $('resTitle').textContent = `שלב ${level.num} הושלם!`;
  const m = $('resMedal');
  m.className = `big-medal ${medal}`;
  m.textContent = '★'.repeat(stars);
  $('resPerfect').textContent = `${sim.perfects}/${sim.course.decisions.length}`;
  $('resFalls').textContent = String(sim.misses);
  $('resCombo').textContent = `x${sim.bestCombo}`;
  const ul = $('resLines');
  ul.innerHTML = '';
  const L2 = level.L * level.L;
  for (const e of sim.log.filter((x) => x.action === 'fire')) {
    const d = sim.course.decisions.find((q) => q.id === e.decision)!;
    const hk = d.hooks.find((q) => q.id === e.hook)!;
    const li = document.createElement('li');
    if (d.kind === 'strip') {
      const sum = (e.a ?? 0) ** 2 + d.strip!.b ** 2;
      li.className = sum <= L2 ? 'ok' : 'bad';
      li.innerHTML = `קפיצה מ־<bdi dir="ltr">${e.a}</bdi>: <bdi dir="ltr">${e.a}² + ${d.strip!.b}² = ${sum} ${sum <= L2 ? '≤' : '>'} ${L2}</bdi>`;
    } else if (hk.spec.frame) {
      const f = hk.spec.frame;
      li.className = hk.holds ? 'ok' : 'bad';
      li.innerHTML = `זרוע: <bdi dir="ltr">${f.post}² + ${f.beam}² ${hk.holds ? '=' : '≠'} ${f.brace}²</bdi>`;
    } else {
      const s = hk.spec;
      const terms = s.z !== undefined && s.z !== 0 ? `${s.a}² + ${s.z}² + ${s.b}²` : `${s.a}² + ${sq(s.b)}`;
      li.className = hk.reaches ? 'ok' : 'bad';
      li.innerHTML = `וו ${hk.num}: <bdi dir="ltr">${terms} = ${hk.reachSq} ${hk.reaches ? '≤' : '>'} ${L2}</bdi>${hk.perfect ? ' ⭐' : ''}`;
    }
    ul.appendChild(li);
  }
  $('resLesson').innerHTML = ltrMath(level.lesson);
  const tips: string[] = [];
  if (sim.misses > 0) tips.push('לשני כוכבים: בלי נפילות');
  if (sim.perfects < sim.course.decisions.length) tips.push('לשלושה: בכל קפיצה, הוו הרחוק ביותר שעדיין מגיע');
  $('resNext').textContent = stars === 3 ? 'מושלם!' : tips.join(' · ');
  $('btnNext').textContent = levelIdx < LEVELS.length - 1 ? 'לשלב הבא ◀' : 'סיום — לשלבים';
  $('resChain').innerHTML = LEVELS.map((l, i) => `<span class="${['', 'bronze', 'silver', 'gold'][best[l.id] ?? 0]} ${i === levelIdx ? 'cur' : ''}">${l.num}</span>`).join('');
  ui.results.classList.remove('hidden');
  try {
    store.set('log', [...store.get<unknown[]>('log', []), ...sim.log].slice(-500));
  } catch {
    /* ignore */
  }
}

// ---------- sim events → juice ----------
function handleEvents(): void {
  const pos = new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z);
  for (const ev of sim.events) {
    switch (ev) {
      case 'jump':
        sfx.jump();
        break;
      case 'decide':
        sfx.focusOn();
        hoverId = null;
        if (sim.decision && !coached.has('first')) {
          coached.add('first');
          showCoach(level.coach);
        }
        break;
      case 'strip':
        if (level.coachStrip && !coached.has('strip')) {
          coached.add('strip');
          showCoach(level.coachStrip);
        }
        break;
      case 'fire':
        sfx.fire();
        hideCoach();
        ui.explain.classList.add('hidden');
        break;
      case 'attach': {
        sfx.attach();
        shake = 0.15;
        const o = sim.lastOutcome!;
        if (o.kind === 'hit') toast(`<bdi dir="ltr">${outcomeTerms(o)} = ${fmt(o.sumSq)} ≤ ${fmt(o.Lsq)} ✓</bdi>`);
        break;
      }
      case 'perfect':
        ui.starPop.classList.remove('hidden');
        ui.starPop.style.animation = 'none';
        void ui.starPop.offsetWidth;
        ui.starPop.style.animation = '';
        starPopT = 1.1;
        sfx.medal('silver');
        if (!prefs.reduced) {
          ui.flash.style.opacity = '0.35';
          setTimeout(() => (ui.flash.style.opacity = '0'), 120);
        }
        break;
      case 'short': {
        sfx.short();
        const o = sim.lastOutcome!;
        if (sim.ropeTip) shortTag = { pos: new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z), text: `חסר ${fmt(o.shortBy)} מ׳`, t: 2.4 };
        showExplain(o);
        break;
      }
      case 'collapse':
        sfx.creak();
        shake = 0.35;
        showExplain(sim.lastOutcome!);
        break;
      case 'canopy':
        sfx.boing();
        hero.bounce();
        shake = 0.4;
        if (sim.decision) world?.bounceCanopy(sim.decision.id);
        puff(pos, 14, 2.2);
        world?.scatterPigeons(pos);
        sfx.flap();
        break;
      case 'release':
      case 'pull_arrive':
        sfx.release();
        break;
      case 'flip':
        sfx.release();
        hero.flip();
        break;
      case 'land':
        sfx.land(false);
        puff(pos, 6, 1.2);
        break;
      case 'land_hard':
        sfx.land(true);
        hero.bounce();
        shake = 0.3;
        puff(pos, 12, 2.4);
        world?.scatterPigeons(pos);
        break;
      case 'climb':
        sfx.jump();
        break;
      case 'finish':
        resultsT = 1.8;
        puff(pos, 18, 3);
        world?.scatterPigeons(pos);
        break;
    }
  }
  sim.events.length = 0;
}

// ---------- frame ----------
function frame(dt: number): void {
  if (screen === 'play') {
    let inp: Input = { hook: pendingHook, jump: pendingJump, tile: pendingTile };
    if (pendingHook || pendingJump || pendingTile) hideCoach();
    pendingHook = null;
    pendingJump = false;
    pendingTile = null;
    if (auto) inp = auto.input();
    if (inp.hook) hoverId = inp.hook;
    sim.update(dt, inp);
    handleEvents();
    if (resultsT > 0 && (resultsT -= dt) <= 0) showResults();
  } else if (screen !== 'paused') {
    sim.update(0, NO_INPUT);
  }
  // bullet time slows the visuals, not the decision clock
  const visDt = sim.state === 'decide' ? dt * 0.05 : dt;
  const ropeTarget = sim.ropeTip ? new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z) : null;
  hero.update(visDt, sim, ropeTarget, screen !== 'play' && screen !== 'paused');
  if (debugCam) {
    const lp = new THREE.Vector3();
    debugCam.look.getWorldPosition(lp);
    camera.position.copy(lp).add(debugCam.pos);
    camera.lookAt(lp);
  } else updateCamera(dt);
  world?.update(visDt, performance.now() / 1000, sim, new THREE.Vector3(sim.p.x, sim.p.y, sim.p.z));
  updateRope();
  updateOverlay();
  for (let i = dust.length - 1; i >= 0; i--) {
    const q = dust[i];
    q.life -= dt;
    q.v.y -= dt * 2;
    q.m.position.addScaledVector(q.v, dt);
    q.m.scale.multiplyScalar(1 + dt * 1.5);
    (q.m.material as THREE.MeshStandardMaterial).opacity = Math.max(0, q.life);
    if (q.life <= 0) {
      scene.remove(q.m);
      (q.m.material as THREE.Material).dispose();
      dust.splice(i, 1);
    }
  }
  sfx.wind(Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z));
  updateHud(dt);
  renderer.render(scene, camera);
}

function updateRope(): void {
  if (!sim.ropeTip) {
    ropeMesh.visible = false;
    return;
  }
  const a = hero.hand.clone();
  const b = new THREE.Vector3(sim.ropeTip.x, sim.ropeTip.y, sim.ropeTip.z);
  const dv = b.clone().sub(a);
  const l = dv.length();
  if (l < 0.05) {
    ropeMesh.visible = false;
    return;
  }
  ropeMesh.visible = true;
  ropeMesh.scale.set(0.05, l, 0.05);
  ropeMesh.position.copy(a).addScaledVector(dv, 0.5);
  ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize());
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth / innerHeight < 1 ? 70 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
if (isTouch) document.body.classList.add('touch');

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
  const d = sim.decision;
  const o = sim.lastOutcome;
  return JSON.stringify({
    screen,
    level: level.id,
    L: level.L,
    player: {
      pos: { x: +sim.p.x.toFixed(2), y: +sim.p.y.toFixed(2), z: +sim.p.z.toFixed(2) },
      vel: { x: +sim.vel.x.toFixed(2), y: +sim.vel.y.toFixed(2), z: +sim.vel.z.toFixed(2) },
      state: sim.state,
    },
    decision: d
      ? {
          id: d.id,
          kind: d.kind,
          P: d.P,
          stripTile: d.kind === 'strip' ? sim.stripTile : undefined,
          stripWaiting: d.kind === 'strip' ? sim.stripWaiting : undefined,
          maxTile: d.strip?.maxN,
          hooks: d.hooks.map((hk) => ({
            num: hk.num,
            id: hk.id,
            a: hk.spec.a,
            b: hk.spec.b,
            z: hk.spec.z,
            reach: +Math.sqrt(hk.reachSq).toFixed(3),
            reaches: hk.reaches,
            holds: hk.holds,
            ok: hk.ok,
            perfect: hk.perfect,
            tried: sim.tried.has(hk.id),
            hovered: hoverId === hk.id,
          })),
        }
      : null,
    decisionsDone: sim.decided,
    decisionsTotal: sim.course.decisions.length,
    combo: sim.combo,
    misses: sim.misses,
    perfects: sim.perfects,
    stars: sim.stars(),
    hintsUsed: sim.hintsUsed,
    runTime: +sim.timer.toFixed(2),
    finished: sim.finished,
    lastOutcome: o ? { kind: o.kind, hook: o.hook, sumSq: o.sumSq, Lsq: o.Lsq, reach: +o.reach.toFixed(3), short_by_m: +o.shortBy.toFixed(3), perfect: o.perfect, tile: o.tile } : null,
    objective: sim.finished ? 'level complete' : sim.state === 'decide' ? 'tap the hook the rope reaches' : sim.state === 'strip' ? 'jump from the farthest tile that still reaches' : 'run',
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
  tapHook: (num: number) => {
    const hk = sim.choices().find((h) => h.num === num);
    if (hk) pendingHook = hk.id;
    return !!hk;
  },
  hover: (num: number) => (hoverId = sim.decision?.hooks.find((h) => h.num === num)?.id ?? null),
  jump: () => (pendingJump = true),
  tapTile: (n: number) => (pendingTile = n),
  autoplay: (policy: 'best' | 'wrong' = 'best') => (auto = new AutoPlayer(sim, policy === 'best' ? bestPolicy : wrongFirstPolicy)),
  stopAuto: () => (auto = null),
  until: (state: string, max = 3000) => {
    let i = 0;
    while (sim.state !== state && i++ < max) window.advanceTime(1000 / 60);
    return sim.state === state;
  },
  realtime: () => (manualTime = false),
  get world() {
    return world;
  },
  get camera() {
    return camera;
  },
  /** close-up on the first flying pigeon (debug screenshots) */
  watchBird: (on = true) => {
    let bird: THREE.Object3D | null = null;
    world?.root.traverse((o) => {
      if (!bird && (o as THREE.SkinnedMesh).isSkinnedMesh) bird = o;
    });
    debugCam = on && bird ? { pos: new THREE.Vector3(0.9, 0.5, 1.4), look: bird } : null;
  },
};

// ---------- boot ----------
loadLevel(0);
showTitle();
requestAnimationFrame(loop);
loadAssets().then(() => {
  if (world) {
    scene.remove(world.root);
    world.dispose();
  }
  world = buildWorld(sim.course, assets);
  scene.add(world.root);
});
