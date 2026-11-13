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
      const mock = {
        timers: [timer],
        state,
        calls: [] as unknown[],
        reads: 0,
        failControl: false,
      };
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
            if (mock.failControl) return false;
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

test('kiosk development mode connects the live bridge without fixture controls', async ({
  page,
}) => {
  await installBridge(page);
  await page.goto('http://localhost:5174');
  await expect(page.locator('.fixture-controls')).toHaveCount(0);
  await expect(page.locator('.timer-pill')).toContainText('Pasta');
  await expect(page.getByLabel('Playing music')).toContainText('Kitchen song');
  await page.locator('.timer-pill').click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible();
});

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
  await expect(page.getByRole('button', { name: '+1 minute' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Dismiss', exact: true }),
  ).toHaveAttribute('href', 'ks://voice/stop');
});

test('finished-timer stop link works without timer controls and waits for native confirmation', async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    delete (window as any).kioskSatellite.controlVoiceTimer;
  });
  await page.goto('http://localhost:4173');
  await expect(page.locator('.timer-pill')).toBeVisible();
  await page.evaluate(() => {
    const mock = (window as any).mock;
    mock.timers[0].finished = true;
    mock.timers[0].is_active = false;
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:voice-timers', {
        detail: { timers: mock.timers },
      }),
    );
  });
  await page.locator('.timer-pill').click();
  const dismiss = page.getByRole('link', { name: 'Dismiss', exact: true });
  await expect(dismiss).toHaveAttribute('href', 'ks://voice/stop');
  // Emulate native URL interception, but not its unverified timer/audio effects.
  await dismiss.evaluate((link) =>
    link.addEventListener('click', (event) => event.preventDefault()),
  );
  await dismiss.click();
  expect(await page.evaluate(() => (window as any).mock.calls)).toEqual([]);
  await expect(page.locator('.timer-pill')).toContainText('Finished');
  await page.evaluate(() => {
    (window as any).mock.timers = [];
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:voice-timers', {
        detail: { timers: [] },
      }),
    );
  });
  await expect(page.locator('.timer-pill')).toHaveCount(0);
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
  const start = new Date('2026-11-09T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.goto('http://localhost:4173');
  await expect(page.locator('.timer-pill')).toBeVisible();
  // Initialize the deadline after the clock has taken effect in the document.
  await page.evaluate(() => {
    const mock = (window as any).mock;
    mock.timers[0].ends_at = new Date(Date.now() + 120_000).toISOString();
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:voice-timers', {
        detail: { timers: mock.timers },
      }),
    );
  });
  await expect(page.locator('.timer-pill')).toContainText('2:00');
  // Fractional seconds round down immediately, without waiting for the old
  // one-second interval to tick. Crossing a boundary updates within 100ms.
  await page.clock.fastForward(100);
  await expect(page.locator('.timer-pill')).toContainText('1:59');
  await page.clock.fastForward(1000);
  await expect(page.locator('.timer-pill')).toContainText('1:58');
  await page.clock.fastForward(125_000);
  await expect(page.locator('.timer-pill')).toContainText('0:00');
  await expect(page.locator('.timer-pill')).not.toHaveClass(/done/);
});
