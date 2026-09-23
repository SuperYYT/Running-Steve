import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = 'artifacts/pass-dash-scroll';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 8, null, { timeout: 15000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(200);

// freeze-ish: pause for screenshot? better stay playing so scroll happens
const shotA = await page.locator('#game-canvas').screenshot();
writeFileSync(`${outDir}/road-t0.png`, shotA);
await page.waitForTimeout(450);
const shotB = await page.locator('#game-canvas').screenshot();
writeFileSync(`${outDir}/road-t1.png`, shotB);

// crude motion metric: compare raw byte difference ratio
let diff = 0;
const n = Math.min(shotA.length, shotB.length);
for (let i = 0; i < n; i += 1) {
  if (shotA[i] !== shotB[i]) diff += 1;
}
const ratio = diff / n;
const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
console.log(JSON.stringify({ distance: diag?.distance, speed: diag?.player?.speed, byteDiffRatio: ratio, errors }, null, 2));
await browser.close();
if (errors.length || ratio < 0.02) process.exitCode = 1;
