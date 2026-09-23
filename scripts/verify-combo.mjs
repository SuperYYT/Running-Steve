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
await page.waitForTimeout(100);

const a = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.addPickups(4));
const b = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.addPickups(1));
const c = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.addPickups(5));
const d = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.addPickups(5));

// expect: 4 -> combo 1, 5th -> combo 2, +5 -> combo 3, +5 -> combo 4
// score: each cookie value 1 * combo at collect time
// 4 at x1 = 4; 1 at x2 = 2; 5: first at x2 then... wait all 5 in one call use same loop
// collectFish 5 times: streak 6,7,8,9,10 -> combos 2,2,2,2,3  scores 2+2+2+2+3=11
// Actually after addPickups(1): streak=5, combo=2, score=4+2=6
// addPickups(5): streak 6..10, combos 2,2,2,2,3, score +2+2+2+2+3 = 11 → total 17
// addPickups(5): streak 11..15, combos 3,3,3,3,4, score +3*4+4=16 → total 33

console.log(JSON.stringify({ a, b, c, d, errors }, null, 2));
const ok =
  a?.combo === 1 &&
  b?.combo === 2 &&
  c?.combo === 3 &&
  d?.combo === 4 &&
  b?.streak === 5 &&
  d?.streak === 15 &&
  errors.length === 0;
await browser.close();
if (!ok) process.exitCode = 1;
