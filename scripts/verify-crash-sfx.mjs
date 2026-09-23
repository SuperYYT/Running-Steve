import { chromium } from '@playwright/test';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('response', (r) => {
  if (r.url().includes('mariofail') && !r.ok()) failed.push(`${r.status()} ${r.url()}`);
});

await page.goto(url);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 8, null, { timeout: 15000 });

// unlock audio + load buffer via keyboard
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('gameover'));
await page.waitForTimeout(400);

const audioOk = await page.evaluate(async () => {
  const res = await fetch('audio/mariofail.mp3');
  return { ok: res.ok, type: res.headers.get('content-type'), len: (await res.arrayBuffer()).byteLength };
});

console.log(JSON.stringify({ audioOk, failed, errors }, null, 2));
await browser.close();
if (!audioOk.ok || audioOk.len < 1000 || errors.length || failed.length) process.exitCode = 1;
