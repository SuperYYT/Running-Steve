import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5188');
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(450);
await page.screenshot({ path: 'artifacts/pass-7/sneak-clear.png' });
await page.keyboard.up('ArrowDown');

const math = await page.evaluate(() => {
  // Collider band (authoritative for gameplay)
  const sneakTop = 0.62 * 2;
  const standTop = 1.1 * 2;
  const phBot = 2.05 - 0.28;
  const phTop = 2.05 + 0.28;
  // Visual estimate: scale 1.1, hip = 0.75*0.45, pitch 0.5, head 0.82 up
  const scale = 1.1;
  const hip = 0.75 * 0.45;
  const headCenterY = hip + (1.0 - 0.18) * Math.cos(0.5);
  const sneakVisualTop = (headCenterY + 0.25) * scale;
  const standVisualTop = (0.75 + 1.0 + 0.25) * scale;
  return {
    collider: {
      sneakTop,
      standTop,
      phBot,
      phTop,
      sneakClears: sneakTop < phBot,
      standHits: standTop > phBot,
      gap: phBot - sneakTop,
    },
    visual: {
      sneakVisualTop,
      standVisualTop,
      sneakClearsVisual: sneakVisualTop < phBot,
      gapVisual: phBot - sneakVisualTop,
    },
  };
});
console.log(JSON.stringify(math, null, 2));
await browser.close();
