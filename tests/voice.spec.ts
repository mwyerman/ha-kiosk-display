import { test, expect } from '@playwright/test';

test('external recipe updates close the picker and scroll the selected step without a reload', async ({
  page,
}) => {
  const recipe = {
    id: 'soup',
    title: 'Voice soup',
    photo: null,
    source: null,
    description: '',
    servings: null,
    yield: null,
    ingredients: [{ id: 'i', text: '2 cups stock', section: null }],
    steps: Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      title: '',
      text: `Instruction ${i + 1}. `.repeat(25),
      section: null,
    })),
  };
  let session: any = { revision: 0, recipe: null, selected: null, checked: [] };
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.addInitScript(() => {
    class FakeSource extends EventTarget {
      constructor(_url: string) {
        super();
        (window as any).recipeEvents = this;
      }
      close() {}
    }
    (window as any).EventSource = FakeSource;
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/recipes')
        ? { items: [], totalPages: 0, total: 0 }
        : session,
    }),
  );
  await page.goto('http://localhost:5174');
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  session = { revision: 1, recipe, selected: null, checked: [] };
  await page.evaluate(() =>
    (window as any).recipeEvents?.dispatchEvent(
      new MessageEvent('message', { data: '{"revision":1}' }),
    ),
  );
  await expect(page.getByRole('heading', { name: 'Voice soup' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  session = { ...session, revision: 2, selected: 's18' };
  await page.evaluate(() =>
    (window as any).recipeEvents.dispatchEvent(
      new MessageEvent('message', { data: '{"revision":2}' }),
    ),
  );
  await expect(page.locator('.step.selected')).toContainText('Instruction 19');
  await expect
    .poll(() => page.locator('.steps').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  expect(navigations).toBe(1);
  session = { revision: 3, recipe: null, selected: null, checked: [] };
  await page.evaluate(() =>
    (window as any).recipeEvents.dispatchEvent(
      new MessageEvent('message', { data: '{"revision":3}' }),
    ),
  );
  await expect(page.locator('.ambient')).toBeVisible();
});
