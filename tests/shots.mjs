// Captures gameplay screenshots with a real (headless) Chromium against the dev server.
// Usage: npm run dev (port 5178) then `npm run shots`. Output: screenshots/*.png
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.RH_URL ?? 'http://127.0.0.1:5178/';
fs.mkdirSync('screenshots', { recursive: true });

// Use a cached headless shell when the exact Playwright build isn't downloaded.
import os from 'node:os';
import path from 'node:path';
function cachedShell() {
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(root, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
} catch {
  browser = await chromium.launch({ executablePath: cachedShell(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
}
const errors = [];

async function session(name, viewport, touch, steps) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(URL + (touch ? '?touch=1' : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await page.waitForFunction(() => Object.keys(JSON.parse(window.render_game_to_text()).assets).length === 4, null, { timeout: 30000 });
  for (const [shot, fn] of steps) {
    await page.evaluate(fn);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `screenshots/${shot}.png` });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    console.log(shot, state.level, state.player.state, `t=${state.timer}`, state.lastOutcome ? `${state.lastOutcome.kind}:${state.lastOutcome.anchor}` : '', JSON.stringify(state.assets));
  }
  await page.close();
}

const until = `window.__until = (pred, max = 3000) => { let i = 0; while (!pred(window.__rh.sim) && i < max) { window.advanceTime(1000 / 60); i++; } return i; };`;

await session('desktop', { width: 1280, height: 720 }, false, [
  ['01-title', () => 0],
  ['02-aim', `${until} window.__rh.startLevel(0); window.__rh.teleportToMark('M1'); window.advanceTime(1200); window.__rh.setTarget('A'); window.advanceTime(30);`],
  ['03-swing', `window.__rh.setTarget('A'); window.__rh.fire(); window.advanceTime(420);`],
  ['04-miss', `window.__rh.startLevel(0); window.__rh.autoplay(['B','A']); window.__until((s) => s.state === 'bounce'); window.advanceTime(100);`],
  ['05-results', `window.__until(() => JSON.parse(window.render_game_to_text()).screen === 'results', 5000); window.advanceTime(200);`],
  ['06-courtyard', `window.__rh.startLevel(5); window.__rh.teleportToMark('M1'); window.advanceTime(1500); window.__rh.setTarget('A'); window.advanceTime(30);`],
  ['07-brackets', `window.__rh.startLevel(6); window.__rh.teleportToMark('M1'); window.advanceTime(1500); window.__rh.setTarget('B'); window.advanceTime(30);`],
  ['08-night', `window.__rh.startLevel(7); window.__rh.teleportToMark('M1'); window.advanceTime(1500); window.__rh.setTarget('B'); window.advanceTime(30);`],
  ['09-downswing', `window.__rh.startLevel(4); window.__rh.teleportToMark('M1'); window.advanceTime(1500); window.__rh.setTarget('A'); window.__rh.fire(); window.advanceTime(500);`],
]);

await session('mobile', { width: 844, height: 390 }, true, [
  ['10-mobile-aim', `${until} window.__rh.startLevel(0); window.__rh.teleportToMark('M1'); window.advanceTime(1200); window.__rh.setTarget('A'); window.advanceTime(30);`],
  ['11-mobile-swing', `window.__rh.setTarget('A'); window.__rh.fire(); window.advanceTime(420);`],
  ['12-mobile-miss', `window.__rh.startLevel(0); window.__rh.autoplay(['B','A']); window.__until((s) => s.state === 'bounce'); window.advanceTime(100);`],
]);

await browser.close();
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
