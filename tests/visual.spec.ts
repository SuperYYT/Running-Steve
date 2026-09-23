import { expect, test } from '@playwright/test';

test.describe('pelican-bike smoke', () => {
  test('boots, advances distance on input, and reaches gameover/retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    const boot = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(boot?.canvas.width).toBeGreaterThan(100);
    expect(boot?.renderer.calls).toBeGreaterThan(10);
    expect(boot?.renderer.triangles).toBeGreaterThan(50);

    // Title → play
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state)).toBe('playing');

    const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.distance ?? 0);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(80);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const mid = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(mid?.distance ?? 0).toBeGreaterThan(before);
    expect([1, 0, -1]).toContain(mid?.player.lane);

    // Force a crash via test hook and retry
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('gameover'));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state)).toBe('gameover');
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state)).toBe('playing');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
