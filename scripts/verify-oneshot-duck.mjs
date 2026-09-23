import { chromium } from '@playwright/test';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

// Hold S: should duck briefly then stand even if key stays down
await page.keyboard.down('KeyS');
const samples = [];
for (let i = 0; i < 12; i += 1) {
  await page.waitForTimeout(100);
  const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.ducking);
  samples.push(Boolean(d));
}
await page.keyboard.up('KeyS');
const heldTrueCount = samples.filter(Boolean).length;
const autoStood = samples[0] === true && samples[samples.length - 1] === false;

// After stand, a new press ducks again once
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
const duckAgain = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.ducking);
await page.waitForTimeout(700);
const stoodAfter = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.ducking);

console.log(JSON.stringify({ samples, heldTrueCount, autoStood, duckAgain, stoodAfter, errors }, null, 2));
await browser.close();
// Must: start ducking on hold, then auto stand while key still held; not duck for entire 1.2s
const ok = samples[0] === true && autoStood && heldTrueCount < samples.length && duckAgain === true && stoodAfter === false && errors.length === 0;
if (!ok) process.exitCode = 1;
