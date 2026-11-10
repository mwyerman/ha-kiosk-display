import { test, expect, type Page } from '@playwright/test';

async function installBridge(page: Page, denied = false) {
  await page.addInitScript(
    ({ denied }) => {
      const timer = {
        timer_id: 'pasta',
        name: 'Pasta',
        total_seconds: 120,
        seconds_left: 120,
        is_active: true,
        ends_at: new Date(Date.now() + 120_000).toISOString(),
        finished: false,
      };
      const state = {
        mediaPlayer: {
          state: 'playing',
          title: 'Kitchen song',
          artist: 'Artist',
          source: 'Sonos',
          nowPlayingShown: false,
        },
      };
      const mock = { timers: [timer], state, calls: [] as unknown[], reads: 0 };
      Object.assign(window, { mock });
      Object.assign(window, {
        kioskSatellite: {
          version: '2026.11.8',
          getVoiceTimers: async () => {
            mock.reads++;
            return { timers: mock.timers };
          },
          getKioskState: async () => mock.state,
          ha: {
            call: async () => {
              if (denied)
                throw { code: 'not_allowed', message: 'private detail' };
              return { id: 'private-user' };
            },
          },
          controlVoiceTimer: async (
            id: string,
            action: string,
            duration: unknown,
          ) => {
            mock.calls.push({ id, action, duration });
            if (action === 'pause') {
              timer.is_active = false;
              timer.seconds_left = 90;
            }
            if (action === 'resume') timer.is_active = true;
            if (action === 'cancel') mock.timers = [];
            window.dispatchEvent(
              new CustomEvent('kiosksatellite:voice-timers', {
                detail: { timers: mock.timers },
              }),
            );
            return true;
          },
        },
      });
    },
    { denied },
  );
}

test('production uses native snapshots, events, controls and followed media', async ({
  page,
}) => {
  await installBridge(page);
  await page.goto('http://localhost:4173');
  await expect(page.locator('.timer-pill')).toContainText('Pasta');
  await expect(page.getByLabel('Playing music')).toContainText('Kitchen song');
  await expect(page.locator('.ambient')).toBeVisible();
  await page.locator('.timer-pill').click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.timer-pill')).toContainText('1:30');
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  expect(await page.evaluate(() => (window as any).mock.calls[1])).toEqual({
    id: 'pasta',
    action: 'add',
    duration: { minutes: 1 },
  });
  await page.getByRole('button', { name: 'Cancel timer', exact: true }).click();
  await expect(page.locator('.timer-pill')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:kiosk-state', {
        detail: { mediaPlayer: { state: 'paused' } },
      }),
    ),
  );
  await expect(page.locator('.surfaces')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.timer-pill')).toHaveCount(1);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:voice-timers', {
        detail: {
          timers: [
            {
              timer_id: 'pasta',
              name: 'Pasta',
              seconds_left: 0,
              is_active: false,
              finished: true,
              ends_at: null,
            },
          ],
        },
      }),
    ),
  );
  await expect(page.locator('.timer-pill')).toContainText('Finished');
  await page.locator('.timer-pill').click();
  await expect(page.getByRole('dialog')).toContainText(
    'native timer interface',
  );
  await expect(page.getByRole('button', { name: '+1 minute' })).toHaveCount(0);
});

test('diagnostics reports shared HA access errors without leaking raw results', async ({
  page,
}) => {
  await installBridge(page, true);
  await page.goto('http://localhost:4173/?diagnostics');
  await expect(page.getByRole('dialog')).toContainText('not_allowed');
  await expect(page.getByRole('dialog')).not.toContainText('private detail');
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('kiosksatellite:ha-closed')),
  );
  await expect(page.getByRole('dialog')).toContainText('Connection lost');
  const before = await page.evaluate(() => (window as any).mock.reads);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('kiosksatellite:screenon')),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).mock.reads))
    .toBeGreaterThan(before);
});

test('deadline countdown updates without events and zero does not manufacture completion', async ({
  page,
}) => {
  await installBridge(page);
  await page.clock.install();
  await page.goto('http://localhost:4173');
  await expect(page.locator('.timer-pill')).toContainText('2:00');
  await page.clock.fastForward(125_000);
  await expect(page.locator('.timer-pill')).toContainText('0:00');
  await expect(page.locator('.timer-pill')).not.toHaveClass(/done/);
});
