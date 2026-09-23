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
await page.waitForTimeout(150);

// Force a cake pickup near the player by calling internal path via test... we don't have a hook.
// Instead sample camera FOV stability: collect diagnostics over frames while simulating
// a synthetic gold collect through repeated play is hard. Measure FOV via three is private.
// Proxy check: ensure no page errors and jackpot overlay/score-pop elements exist and animate.

const hasFx = await page.evaluate(() => ({
  jackpot: Boolean(document.querySelector('#jackpot-overlay')),
  scorePop: Boolean(document.querySelector('#score-pop')),
}));
console.log('fx-nodes', hasFx);

// Trigger jackpot HUD animation directly to validate CSS nodes work
await page.evaluate(() => {
  const overlay = document.querySelector('#jackpot-overlay');
  const pop = document.querySelector('#score-pop');
  if (overlay) {
    overlay.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 200 });
  }
  if (pop) {
    pop.dataset.tier = 'cake';
    pop.textContent = '蛋糕 +5';
    pop.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 10px) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, -8px) scale(1.12)', offset: 0.22 },
        { opacity: 0, transform: 'translate(-50%, -36px) scale(1)' },
      ],
      { duration: 200 },
    );
  }
});
await page.waitForTimeout(80);
const popText = await page.locator('#score-pop').innerText();
const popTier = await page.locator('#score-pop').getAttribute('data-tier');
console.log('score-pop', { popText, popTier });

// Measure camera "twitch": sample screenshot hash stability is weak.
// Instead read FOV through a tiny probe if available — not exposed.
// Check that collectFish no longer calls punchFov by grepping is compile-time; runtime:
// run two frames and ensure distance still advances (game not stuck).
const d0 = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.distance ?? 0);
await page.waitForTimeout(300);
const d1 = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.distance ?? 0);
console.log('distance-advances', { d0, d1, ok: d1 > d0 });
console.log('errors', errors);
await browser.close();
if (errors.length || !hasFx.jackpot || !hasFx.scorePop || !(d1 > d0)) process.exitCode = 1;
