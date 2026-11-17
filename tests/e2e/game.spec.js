import { test, expect } from '@playwright/test';

function trackErrors(page, bucket) {
  page.on('pageerror', e => bucket.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') bucket.push('console: ' + m.text()); });
}

test('host lobby renders with QR, room code and 3D background', async ({ page }) => {
  const errs = []; trackErrors(page, errs);
  await page.goto('/?local=1&room=LOBY');
  await expect(page.locator('#lobby')).toHaveClass(/show/);
  await expect(page.locator('#room-code')).toHaveText('LOBY');
  await expect(page.locator('#qr')).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.locator('canvas.game-canvas')).toBeVisible();
  await expect(page.locator('.pcard')).toHaveCount(8);
  // cycle through every track (rebuilds the 3D world each time)
  for (let i = 0; i < 4; i++) { await page.click('#trk-next'); await page.waitForTimeout(700); }
  await expect(page.locator('#track-name')).toHaveText('Sunny Meadow');
  expect(errs).toEqual([]);
});

test('phone joins, picks a character, leader starts race, inputs reach host', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const host = await ctx.newPage();
  const errs = []; trackErrors(host, errs);
  await host.goto('/?local=1&room=PADX');
  await expect(host.locator('#room-code')).toHaveText('PADX');

  const pad = await ctx.newPage();
  trackErrors(pad, errs);
  await pad.setViewportSize({ width: 390, height: 844 });
  await pad.goto('/pad.html?room=PADX&local=1');
  await pad.fill('#nameInput', 'Alex');
  await pad.click('#joinBtn');
  await expect(host.locator('.pcard.filled')).toHaveCount(1);
  await expect(host.locator('.pcard.filled .pname')).toHaveText('Alex');

  // second phone
  const pad2 = await ctx.newPage();
  trackErrors(pad2, errs);
  await pad2.setViewportSize({ width: 390, height: 844 });
  await pad2.goto('/pad.html?room=PADX&local=1');
  await pad2.evaluate(() => localStorage.setItem('pk_pid', 'second-phone'));
  await pad2.reload();
  await pad2.fill('#nameInput', 'Sam');
  await pad2.click('#joinBtn');
  await expect(host.locator('.pcard.filled')).toHaveCount(2);

  // pick a character on phone 1
  const target = await pad.locator('#charGrid .char').nth(3).getAttribute('data-id');
  await pad.locator('#charGrid .char').nth(3).click();
  await expect.poll(() => host.evaluate(() => window.__app.players[0].char)).toBe(target);
  await pad.click('#readyBtn');
  await expect.poll(() => host.evaluate(() => window.__app.players[0].ready)).toBe(true);

  // leader starts the race from the phone
  await expect(pad.locator('#leaderPanel')).toBeVisible();
  await pad.click('#startBtn');
  await expect.poll(() => host.evaluate(() => window.__app.phase)).toBe('race');
  await expect.poll(() => pad.evaluate(() => document.body.dataset.screen), { timeout: 10000 }).toMatch(/race|countdown/);
  // split screen with two viewports
  await expect(host.locator('.hud-panel')).toHaveCount(2);
  // auto-gas default -> host sees gas held
  await pad.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => host.evaluate(() => window.__app.players[0].input.g), { timeout: 8000 }).toBe(1);
  await host.bringToFront(); // the host is the visible TV tab in real use (rAF pauses in background tabs)
  await host.waitForTimeout(7000);
  const k = await host.evaluate(() => { const k = window.__app.race.karts.find(k => k.human && k.slot === 0); return { v: k.v, prog: k.prog }; });
  expect(k.v).toBeGreaterThan(10);
  // host HUD info arrives on the phone
  await expect(pad.locator('#hudLap')).toHaveText('1');
  await expect(pad.locator('#hudPlace')).not.toHaveText('');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('full 1-lap race reaches results with 8 racers', async ({ page }) => {
  const errs = []; trackErrors(page, errs);
  await page.goto('/?local=1&kb=1&autostart=1&bot=1&laps=1');
  await expect(page.locator('.hud-panel')).toHaveCount(1);
  await expect(page.locator('#results')).toHaveClass(/show/, { timeout: 120_000 });
  await expect(page.locator('.rrow')).toHaveCount(8);
  await expect(page.locator('.rrow.human')).toHaveCount(1);
  // next track restarts a race
  await page.click('#btn-next');
  await expect.poll(() => page.evaluate(() => window.__app.phase)).toBe('race');
  expect(errs).toEqual([]);
});
