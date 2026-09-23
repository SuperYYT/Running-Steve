import { chromium } from '@playwright/test';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url);
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 8, null, { timeout: 15000 });
const boot = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
console.log('boot', JSON.stringify({ state: boot?.state, calls: boot?.renderer?.calls, tris: boot?.renderer?.triangles }));

const titleText = await page.locator('#title-panel').innerText();
console.log('title-has-R-hint', /(^|\s)R(\s|$)/.test(titleText) || /R 重来|重来/.test(titleText));
console.log('title-has-Esc', /Esc/i.test(titleText));
console.log('title-has-Shift', /Shift/i.test(titleText));
console.log('title-has-A-and-W', /A/.test(titleText) && /W/.test(titleText));

await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('gameover'));
await page.waitForTimeout(80);
const overText = await page.locator('#gameover-panel').innerText();
console.log('gameover-has-home', overText.includes('返回主页'));
console.log('gameover-has-restart', overText.includes('再来一次'));

await page.locator('#gameover-panel [data-action="home"]').click();
await page.waitForTimeout(120);
console.log('after-home-state', await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state));

await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const beforeLane = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.lane);
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(540, 360, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(250);
const afterLane = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.lane);
console.log('swipe-left', { beforeLane, afterLane });

await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(640, 250, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(120);
const jump = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player);
console.log('swipe-up', { y: jump?.position.y, airborne: jump?.airborne });

await page.keyboard.press('Escape');
await page.waitForTimeout(80);
console.log('esc-pause-state', await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state));
console.log('pause-visible', await page.locator('#pause-panel').isVisible());
console.log('errors', errors);
await browser.close();
if (errors.length) process.exitCode = 1;
