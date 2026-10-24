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
  await page.waitForFunction(() => Object.keys(JSON.parse(window.render_game_to_text()).assets).length >= 5, null, { timeout: 30000 });
  for (const [shot, fn] of steps) {
    await page.evaluate(fn);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `screenshots/${shot}.png` });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    console.log(shot, state.level, state.player.state, `stars=${state.stars}`, state.lastOutcome ? `${state.lastOutcome.kind}:${state.lastOutcome.hook}` : '', JSON.stringify(state.assets));
  }
  await page.close();
}

await session('desktop', { width: 1280, height: 720 }, false, [
  ['01-title', () => 0],
  ['02-decide', `window.__rh.startLevel(1); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.hover(3); window.advanceTime(30);`],
  ['03-swing', `window.__rh.tapHook(3); window.advanceTime(430);`],
  ['04-miss', `window.__rh.startLevel(0); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.tapHook(2); window.__rh.until('bounce'); window.advanceTime(150);`],
  ['05-strip', `window.__rh.startLevel(2); window.__rh.autoplay('best'); window.__rh.until('strip', 5000); window.__rh.stopAuto(); window.advanceTime(1300);`],
  ['06-courtyard', `window.__rh.startLevel(5); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.hover(1); window.advanceTime(30);`],
  ['07-brackets', `window.__rh.startLevel(6); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.hover(1); window.advanceTime(30);`],
  ['08-night', `window.__rh.startLevel(7); window.__rh.until('decide'); window.advanceTime(1500);`],
  ['09-downswing', `window.__rh.startLevel(4); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.hover(3); window.advanceTime(30);`],
  ['10-results', `window.__rh.startLevel(0); window.__rh.autoplay('wrong'); let i = 0; while (JSON.parse(window.render_game_to_text()).screen !== 'results' && i++ < 6000) window.advanceTime(1000 / 60);`],
]);

await session('mobile', { width: 844, height: 390 }, true, [
  ['11-mobile-decide', `window.__rh.startLevel(1); window.__rh.until('decide'); window.advanceTime(1500);`],
  ['12-mobile-strip', `window.__rh.startLevel(2); window.__rh.autoplay('best'); window.__rh.until('strip', 5000); window.__rh.stopAuto(); window.advanceTime(1300);`],
  ['13-mobile-miss', `window.__rh.startLevel(0); window.__rh.until('decide'); window.advanceTime(1500); window.__rh.tapHook(2); window.__rh.until('bounce'); window.advanceTime(150);`],
]);

await browser.close();
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
