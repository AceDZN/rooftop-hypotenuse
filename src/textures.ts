// Small procedural canvas textures (facades, stripes, labels). Generated once, shared.
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const SHUTTERS = ['#2f8f83', '#3d7fa6', '#d9783b', '#5f9b57', '#c7a548', '#7a6fb0'];

/**
 * One facade bay = 4 m wide × 3 m tall (a floor). Windows with coloured shutters, Bauhaus strip
 * windows on some variants. Night variant lights some windows.
 */
export function facadeTexture(variant: number, night: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(256, 192);
  g.fillStyle = night ? '#9aa0b8' : '#fbf3e6';
  g.fillRect(0, 0, 256, 192);
  // plaster noise
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${night ? '40,40,70' : '120,100,70'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 192, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  // floor slab line
  g.fillStyle = night ? 'rgba(30,30,60,0.25)' : 'rgba(150,120,90,0.25)';
  g.fillRect(0, 186, 256, 6);
  const shutter = SHUTTERS[variant % SHUTTERS.length];
  const lit = night && Math.random() < 0.55;
  if (variant % 3 === 2) {
    // horizontal strip window
    g.fillStyle = lit ? '#ffd27a' : night ? '#1c2440' : '#5f7884';
    g.fillRect(18, 70, 220, 58);
    g.fillStyle = night ? '#c9c9d9' : '#ffffff';
    for (let x = 18; x <= 238; x += 55) g.fillRect(x, 70, 4, 58);
    g.fillRect(14, 128, 228, 6);
  } else {
    const w = 70;
    const xs = variant % 3 === 0 ? [40, 146] : [93];
    for (const x of xs) {
      const on = night && Math.random() < 0.5;
      g.fillStyle = on ? '#ffcf6e' : night ? '#1c2440' : '#5d7480';
      g.fillRect(x, 54, w, 86);
      // shutters (half closed)
      g.fillStyle = shutter;
      g.fillRect(x, 54, w, 30 + (variant * 13) % 40);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 56; y < 54 + 30 + ((variant * 13) % 40); y += 6) g.fillRect(x, y, w, 2);
      g.fillStyle = night ? '#c9c9d9' : '#ffffff';
      g.fillRect(x - 6, 140, w + 12, 7);
    }
  }
  return tex(c);
}

/** Red/white 1 m bands: one texture repeat = 2 m (red + white). */
export function bandTexture(night: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(16, 64);
  g.fillStyle = night ? '#d84a3a' : '#d8432f';
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = '#f7f1e6';
  g.fillRect(0, 32, 16, 32);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 31, 16, 2);
  g.fillRect(0, 63, 16, 1);
  return tex(c);
}

export function stripeTexture(a = '#d8432f', b = '#fbf3e4'): THREE.CanvasTexture {
  const [c, g] = canvas(128, 16);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(i * 16, 0, 16, 16);
  }
  return tex(c);
}

export function hazardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#f2b632';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1d1d1d';
  for (let i = -64; i < 128; i += 22) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 11, 0);
    g.lineTo(i + 11 - 64, 64);
    g.lineTo(i - 64, 64);
    g.fill();
  }
  return tex(c);
}

export function rustTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#7b4a33';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    const r = Math.random();
    g.fillStyle = r < 0.5 ? 'rgba(160,90,50,0.35)' : r < 0.8 ? 'rgba(60,35,25,0.3)' : 'rgba(210,150,90,0.25)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 8, 1 + Math.random() * 3);
  }
  return tex(c);
}

/** Flat painted label (numbers on the scaffold, signs). */
export function labelTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; ring?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 128;
  const h = opts.h ?? 128;
  const [c, g] = canvas(w, h);
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  if (opts.ring) {
    g.strokeStyle = opts.ring;
    g.lineWidth = w * 0.08;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = opts.fg ?? '#ffffff';
  g.font = opts.font ?? `800 ${Math.floor(h * 0.62)}px Rubik, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.fillText(text, w / 2, h / 2 + h * 0.04);
  return tex(c, false);
}

export function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = fg;
  g.lineWidth = 14;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = fg;
  g.font = '800 120px Rubik, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.fillText(text, 256, 136);
  return tex(c, false);
}

export function clothTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(32, 32);
  g.fillStyle = color;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(0, 0, 32, 4);
  return tex(c);
}

/** Night emissive mask matching facadeTexture's window layout: black wall, some warm windows. */
export function facadeGlow(variant: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 192);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 192);
  const warm = ['#ffcf6e', '#ffb85c', '#fff0c0'];
  if (variant % 3 === 2) {
    if (Math.random() < 0.6) {
      g.fillStyle = warm[variant % 3];
      g.fillRect(18, 70, 220, 58);
    }
  } else {
    const xs = variant % 3 === 0 ? [40, 146] : [93];
    for (const x of xs) {
      if (Math.random() < 0.55) {
        g.fillStyle = warm[Math.floor(Math.random() * 3)];
        g.fillRect(x, 54 + 30 + ((variant * 13) % 40), 70, 86 - 30 - ((variant * 13) % 40));
      }
    }
  }
  return tex(c);
}
