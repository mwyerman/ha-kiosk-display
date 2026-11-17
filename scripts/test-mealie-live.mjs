// Opt-in read-only Mealie smoke test. Never writes to Mealie or production sessions.
// MEALIE_API_KEY must be supplied securely in the environment; never pass it as argv.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';

const upstream = process.env.MEALIE_URL || 'https://mealie.helios.mxwy.org';
const key = process.env.MEALIE_API_KEY;
assert.ok(key, 'Supply MEALIE_API_KEY in the environment');
const dir = await mkdtemp(join(tmpdir(), 'kiosk-live-'));
const accessKey = randomBytes(32).toString('hex');
const options = {
  mealieUrl: upstream,
  mealieKey: key,
  accessKey,
  dbPath: join(dir, 'session.sqlite'),
};
let server;
let base;
let cookie;
async function start() {
  server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  await new Promise((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
}
async function api(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(
    response.status,
    200,
    `API request failed: ${path} (HTTP ${response.status})`,
  );
  if (response.headers.has('set-cookie'))
    cookie = response.headers.get('set-cookie').split(';')[0];
  return response.json();
}
try {
  await start();
  await api('/api/pair', { key: accessKey });
  const collection = await api('/api/recipes?page=1');
  assert.ok(collection.items.length > 0);
  console.log(
    JSON.stringify({
      check: 'authenticated-list',
      total: collection.total,
      page: collection.page,
    }),
  );
  const names = [
    'Halal Style Chicken Platter',
    'The Best Creamy Chicken Enchiladas',
    'Soy Marinaded Wings',
    'Green Curry Chicken',
  ];
  let lastRecipe;
  for (const name of names) {
    const found = await api(
      `/api/recipes?search=${encodeURIComponent(name)}&page=1`,
    );
    const item = found.items.find((r) => r.title.includes(name));
    assert.ok(item, `Expected test recipe not found: ${name}`);
    const normalized = await api(`/api/recipes/${item.id}`);
    const rawResponse = await fetch(`${upstream}/api/recipes/${item.id}`, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(rawResponse.status, 200);
    const raw = await rawResponse.json();
    assert.equal(normalized.ingredients.length, raw.recipeIngredient.length);
    normalized.ingredients.forEach((ingredient, i) => {
      const original = raw.recipeIngredient[i];
      const expected =
        original.display || original.originalText || original.note;
      if (expected)
        assert.equal(ingredient.text, expected, 'Ingredient wording changed');
    });
    assert.equal(normalized.steps.length, raw.recipeInstructions.length);
    normalized.steps.forEach((step, i) =>
      assert.equal(step.text, raw.recipeInstructions[i].text),
    );
    if (!raw.recipeServings) assert.equal(normalized.servings, null);
    if (!raw.image) assert.equal(normalized.photo, null);
    if (normalized.photo) {
      const image = await fetch(base + normalized.photo, {
        headers: { Cookie: cookie },
      });
      assert.equal(image.status, 200);
      assert.match(image.headers.get('Content-Type'), /^image\//);
      assert.ok((await image.arrayBuffer()).byteLength > 0);
    }
    console.log(
      JSON.stringify({
        check: 'real-recipe',
        title: normalized.title,
        ingredients: normalized.ingredients.length,
        steps: normalized.steps.length,
        photo: Boolean(normalized.photo),
        originalTextPreserved: true,
      }),
    );
    lastRecipe = normalized;
  }
  let session = await api('/api/session');
  session = await api('/api/session', {
    type: 'open',
    recipeId: lastRecipe.id,
    revision: session.revision,
  });

  session = await api('/api/session', {
    type: 'select',
    stepId: lastRecipe.steps[0].id,
    revision: session.revision,
  });
  await stop();
  await start();
  const restored = await api('/api/session');
  assert.deepEqual(
    restored,
    session,
    'Session/cookie did not survive backend restart',
  );
  await api('/api/session', { type: 'finish', revision: restored.revision });
  assert.equal((await api('/api/session')).recipe, null);
  console.log(
    JSON.stringify({ check: 'session-open-select-restart-finish', ok: true }),
  );
  if (process.env.LIVE_BROWSER === 'true') {
    // Exercise built production UI against the real backend, without intercepted APIs.
    await stop();
    options.staticDir = new URL('../dist', import.meta.url).pathname;
    await start();
    const { chromium, expect } = await import('@playwright/test');
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await page
        .getByRole('button', { name: 'Open recipes', exact: true })
        .click();
      await page.getByLabel('Pairing key').fill(accessKey);
      await page
        .getByRole('button', { name: 'Pair kitchen', exact: true })
        .click();
      await page
        .getByLabel('Search recipes')
        .fill('Halal Style Chicken Platter');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page
        .getByRole('button', { name: /Halal Style Chicken Platter/ })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Halal Style Chicken Platter' }),
      ).toBeVisible();
      const ingredient = page.locator('.ing').first();
      await expect(ingredient).toBeVisible();
      await expect(
        page.locator('.ingredientlist button, .ingredientlist .box'),
      ).toHaveCount(0);
      await page.locator('.step').first().click();
      await expect(page.locator('.step').first()).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.reload();
      await expect(page.locator('.ing').first()).toBeVisible();
      await expect(page.locator('.step').first()).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('button', { name: /servings/i })).toHaveCount(
        0,
      );
      await page.screenshot({ path: join(tmpdir(), 'kiosk-mealie-real.png') });
      await page
        .getByRole('button', { name: 'Finish cooking', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Open recipes', exact: true }),
      ).toBeVisible();
      const ambient = page.locator('.ambient img');
      if (await ambient.count())
        await expect
          .poll(() => ambient.evaluate((img) => img.naturalWidth))
          .toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          check: 'real-browser-pair-search-open-select-reload-finish',
          ok: true,
        }),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server?.listening) await stop();
  await rm(dir, { recursive: true, force: true });
}
