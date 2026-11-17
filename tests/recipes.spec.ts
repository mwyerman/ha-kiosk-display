import { test, expect, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

const recipe = {
  id: 'soup',
  title: 'Garden soup',
  photo: null,
  description: 'A family recipe',
  servings: null,
  yield: 'One big pot',
  source: 'https://example.org/soup',
  ingredients: [
    {
      id: 'salt',
      text: '½–1 tsp  salt, or to taste <b>not HTML</b>',
      section: 'For the soup',
    },
  ],
  steps: [
    {
      id: 'simmer',
      title: 'Simmer gently',
      text: 'Stir & simmer.\nDo not boil.',
      section: 'Cooking',
    },
  ],
};
const empty = () => ({
  revision: 0,
  recipe: null as typeof recipe | null,
  checked: [] as string[],
  selected: null as string | null,
});
async function api(page: Page, restored = false) {
  let session = empty();
  if (restored)
    session = { revision: 3, recipe, checked: ['salt'], selected: 'simmer' };
  const writes: any[] = [];
  const searches: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/recipes') {
      searches.push(url.search);
      return route.fulfill({
        json: {
          items: [recipe],
          page: Number(url.searchParams.get('page')),
          totalPages: 2,
          total: 2,
        },
      });
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      writes.push(body);
      expect(body.revision).toBe(session.revision);
      if (body.type === 'open')
        session = { ...empty(), recipe, revision: session.revision };
      if (body.type === 'check') session.checked = body.checked ? ['salt'] : [];
      if (body.type === 'select') session.selected = body.stepId;
      if (body.type === 'finish')
        session = { ...empty(), revision: session.revision };
      session.revision++;
    }
    return route.fulfill({ json: session });
  });
  return { writes, searches };
}

test('touch picker searches, pages, opens, selects and finishes without ingredient actions', async ({
  page,
}) => {
  const mock = await api(page);
  await page.goto('http://localhost:5174');
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await expect(page.getByLabel('Search recipes')).not.toBeFocused();
  await expect(page.getByRole('dialog')).toHaveClass('fullscreen');
  expect(await page.getByRole('dialog').evaluate((el) => el.clientWidth)).toBe(
    1280,
  );
  expect(
    await page
      .locator('.recipe-results')
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
      ),
  ).toBeGreaterThan(1);
  await page.getByLabel('Search recipes').fill('garden & soup');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect
    .poll(() => mock.searches.at(-1))
    .toContain('search=garden+%26+soup');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => mock.searches.at(-1)).toContain('page=2');
  await page.getByRole('button', { name: /Garden soup/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.ing').click();
  await expect(
    page.locator('.ingredientlist button, .ingredientlist .box'),
  ).toHaveCount(0);
  await page.locator('.step').click();
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.step').click();
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  await expect(page.locator('.ambient')).toBeVisible();
  expect(mock.writes.map((w) => w.type)).toEqual([
    'open',
    'select',
    'select',
    'finish',
  ]);
  expect(mock.writes[1]).toMatchObject({ stepId: 'simmer' });
  expect(mock.writes[2]).toMatchObject({ stepId: null });
});

test('pairing waits for a tap, submits only the local pairing key, then restores and lists recipes', async ({
  page,
}) => {
  let paired = false;
  await api(page);
  await page.route('**/api/session', (route) =>
    route.fulfill(paired ? { json: empty() } : { status: 401, json: {} }),
  );
  await page.route('**/api/pair', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      key: 'local-kitchen-key',
    });
    paired = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('http://localhost:5174');
  await expect(page.locator('.ambient')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await page.getByLabel('Pairing key').fill('local-kitchen-key');
  await page.getByRole('button', { name: 'Pair kitchen' }).click();
  await expect(page.getByRole('button', { name: /Garden soup/ })).toBeVisible();
  await expect(page.getByLabel('Pairing key')).toHaveCount(0);
});

test('failed mutation keeps authoritative state and persistent error; conflict refresh requires a new tap', async ({
  page,
}) => {
  const mock = await api(page, true);
  let status = 503;
  let posts = 0;
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({ status, json: {} });
    }
    return route.fulfill({
      json: { revision: 7, recipe, checked: ['salt'], selected: 'simmer' },
    });
  });
  await page.goto('http://localhost:5174');
  await page.locator('.step').click();
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toContainText('Unable to update');
  await page.waitForTimeout(2800);
  await expect(page.getByRole('alert')).toBeVisible();
  status = 409;
  await page.locator('.step').click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByRole('alert')).toContainText('try again');
  expect(posts).toBe(2);
  expect(mock.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
});

test('resume refresh preserves current recipe on failure and recipe picker failures are explicit', async ({
  page,
}) => {
  await api(page, true);
  await page.goto('http://localhost:5174');
  await expect(page.locator('.recipe')).toBeVisible();
  await page.route('**/api/session', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('restore');
  await expect(page.locator('.recipe')).toBeVisible();
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: empty() }),
  );
  await page.reload();
  await page.route('**/api/recipes?*', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Unable to load recipes',
  );
});

test('mutations wait for authoritative responses and disable duplicate touches', async ({
  page,
}) => {
  await api(page, true);
  let release!: () => void;
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      received();
      await pending;
      return route.fulfill({
        json: { revision: 4, recipe, checked: [], selected: null },
      });
    }
    return route.fulfill({
      json: { revision: 3, recipe, checked: ['salt'], selected: 'simmer' },
    });
  });
  await page.goto('http://localhost:5174');
  await page.locator('.step').click();
  await arrived;
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.step')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Finish cooking' }),
  ).toBeDisabled();
  release();
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.step')).toBeEnabled();
  expect(posts).toBe(1);
});

test('overlapping resume reads cannot overwrite a newer session', async ({
  page,
}) => {
  await api(page, true);
  await page.goto('http://localhost:5174');
  await expect(page.locator('.recipe')).toBeVisible();
  let release!: () => void;
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route('**/api/session', async (route) => {
    reads++;
    if (reads === 1) {
      received();
      await pending;
      return route.fulfill({ json: empty() });
    }
    return route.fulfill({
      json: { revision: 8, recipe, checked: [], selected: null },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await arrived;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'false');
  release();
  await page.waitForTimeout(150);
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
});

test('fixture interactions stay local and contain no serving scaling controls', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Open recipe', exact: true }).click();
  await page.getByRole('button', { name: /Creamy Tomato Pasta/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Creamy Tomato Pasta' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /servings/i })).toHaveCount(0);
  await page.locator('.ing').first().click();
  await expect(
    page.locator('.ingredientlist button, .ingredientlist .box'),
  ).toHaveCount(0);
  await page.locator('.step').first().click();
  await expect(page.locator('.step').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  await expect(page.locator('.ambient')).toBeVisible();
  expect(requests).toEqual([]);
});

test('missing production backend stays ambient with diagnostics available and no fixtures', async ({
  page,
}) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('http://localhost:4173/?diagnostics');
  await expect(page.getByRole('dialog')).toContainText('Device diagnostics');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.ambient')).toBeVisible();
  await expect(page.locator('.fixture-controls')).toHaveCount(0);
  await expect(page.getByText('Creamy Tomato Pasta')).toHaveCount(0);
});

test('phone picker handles a first-request 401 without obstructing ambient before a tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await api(page);
  await page.route('**/api/recipes?*', (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.goto('http://localhost:5174');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await expect(page.getByLabel('Pairing key')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: 'test-results/recipes-pairing-phone.png' });
});

test('phone picker and recipe preserve the book layout without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await api(page);
  await page.goto('http://localhost:5174');
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Garden soup/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/recipes-picker-phone.png' });
  await page.getByRole('button', { name: /Garden soup/ }).click();
  await expect(page.locator('.ing')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: 'test-results/recipes-book-phone.png' });
});

test('unsafe recipe source is plain content and never an executable link', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        revision: 1,
        recipe: {
          ...recipe,
          source: 'javascript:alert(1)',
          servings: null,
          yield: null,
        },
        checked: [],
        selected: null,
      },
    }),
  );
  await page.goto('http://localhost:5174');
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original recipe' })).toHaveCount(
    0,
  );
  await expect(page.locator('.sub')).toHaveCount(0);
});

test('restores authoritative recipe and exact unparsed text without serving controls', async ({
  page,
}) => {
  await api(page, true);
  await page.goto('http://localhost:5174');
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
  await expect(page.locator('.ing')).toContainText(recipe.ingredients[0].text);
  await expect(page.locator('.ing b')).toHaveCount(0);
  await expect(page.locator('.ing')).not.toHaveAttribute('aria-pressed');
  await expect(
    page.locator('.ingredientlist button, .ingredientlist .box'),
  ).toHaveCount(0);
  await expect(page.locator('.step')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'For the soup' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cooking', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.recipe-backdrop')).toHaveCount(0);
  await expect(page.getByText('One big pot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /servings/i })).toHaveCount(0);
  await expect(page.locator('.sub')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Original recipe' }),
  ).toHaveAttribute('href', recipe.source);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('kiosksatellite:voice-timers', {
        detail: { timers: [] },
      }),
    ),
  );
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
});
