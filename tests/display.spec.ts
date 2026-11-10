import { test, expect } from '@playwright/test';

async function openRecipe(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Open recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Creamy Tomato Pasta' }).click();
}

test('recipe touch actions preserve independent scroll positions', async ({
  page,
}) => {
  await openRecipe(page);
  await expect(
    page.getByRole('heading', { name: 'Creamy Tomato Pasta' }),
  ).toBeVisible();
  const ingredients = page.getByRole('region', {
    name: 'Scrollable ingredients',
  });
  const steps = page.getByRole('region', { name: 'Scrollable instructions' });
  await ingredients.evaluate((el) => (el.scrollTop = 40));
  await steps.evaluate((el) => (el.scrollTop = 180));
  const positions = await Promise.all([
    ingredients.evaluate((el) => el.scrollTop),
    steps.evaluate((el) => el.scrollTop),
  ]);
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(page.locator('.sub')).toContainText('5 servings');
  expect(await ingredients.evaluate((el) => el.scrollTop)).toBe(positions[0]);
  expect(await steps.evaluate((el) => el.scrollTop)).toBe(positions[1]);
  await steps.getByRole('button').nth(2).click();
  await expect(steps.getByRole('button').nth(2)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const ingredient = ingredients.getByRole('button').nth(1);
  await ingredient.click();
  await expect(ingredient).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/recipe-1280x800.png' });
});

test('floating fixtures never switch views and final content clears them', async ({
  page,
}) => {
  await openRecipe(page);
  await page.getByRole('button', { name: 'Timer fixtures' }).click();
  await page
    .getByRole('button', { name: 'Music fixture', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Creamy Tomato Pasta' }),
  ).toBeVisible();
  await expect(page.getByLabel('Playing music')).toBeVisible();
  const steps = page.getByRole('region', { name: 'Scrollable instructions' });
  await steps.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = await steps.getByRole('button').last().boundingBox();
  const surfaces = await page.locator('.surfaces').boundingBox();
  expect(last!.y + last!.height).toBeLessThan(surfaces!.y);
  const ingredients = page.getByRole('region', {
    name: 'Scrollable ingredients',
  });
  await ingredients.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const finalIngredient = await ingredients
    .getByRole('button')
    .last()
    .boundingBox();
  expect(finalIngredient!.y + finalIngredient!.height).toBeLessThan(
    surfaces!.y,
  );
  await page.getByRole('button', { name: 'Pasta · preview' }).click();
  await expect(page.getByRole('dialog')).toContainText('not a running timer');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Finish cooking' }).click();
  await expect(
    page.getByRole('button', { name: 'Open recipes', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/ambient-with-surfaces-1280x800.png',
  });
  await expect(page.locator('.timer-pill')).toHaveCount(2);
});

test('production excludes fixtures and recovers cleanly after reload', async ({
  page,
}) => {
  await page.goto('http://localhost:4173/?view=recipe&fixtures=true');
  await expect(page.locator('.fixture-controls')).toHaveCount(0);
  await expect(page.locator('.surfaces')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Recipes aren’t connected yet',
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open recipes', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/ambient-1280x800.png' });
});

test('diagnostics reports missing bridge and browser metrics', async ({
  page,
}) => {
  await page.goto('http://localhost:4173/?diagnostics');
  await expect(page.getByRole('dialog')).toContainText(
    'Unavailable — open as a Kiosk Satellite custom page',
  );
  await expect(page.locator('.diagnostic-report').last()).toContainText('1280');
  await page.getByLabel('Device test notes').fill('Keyboard test');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('photo failure retains fallback and smaller landscape viewport stays bounded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.route('**/photos/**', (route) => route.abort());
  await openRecipe(page);
  await expect(page.getByText('Recipe photograph unavailable')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1024,
  );
  await expect(
    page.getByRole('button', { name: 'Finish cooking' }),
  ).toBeInViewport();
  await page.screenshot({ path: 'test-results/recipe-1024x600.png' });
});
