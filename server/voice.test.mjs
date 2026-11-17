import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.mjs';

const id = '12345678-1234-4234-8234-123456789abc';
const recipe = {
  id,
  name: 'Garden soup',
  recipeIngredient: [{ display: '2 cups stock' }],
  recipeInstructions: [
    { id: 'a', text: 'Chop.' },
    { id: 'b', text: 'Simmer.' },
  ],
};
async function setup(t, extra = {}) {
  const server = createApp({
    requirePairing: false,
    voiceKey: 'VOICE_TEST_KEY',
    fetchImpl: async (url) =>
      Response.json(
        String(url).includes('/recipes?')
          ? { items: [recipe], total: 1, totalPages: 1 }
          : recipe,
      ),
    ...extra,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    call: (data, key = 'VOICE_TEST_KEY', headers = {}) =>
      fetch(base + '/api/voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...headers,
        },
        body: JSON.stringify(data),
      }),
  };
}

test('voice is a separate authenticated endpoint even in trusted-LAN mode', async (t) => {
  const app = await setup(t);
  assert.equal((await app.call({ action: 'current' }, '')).status, 401);
  assert.equal((await app.call({ action: 'current' }, 'wrong')).status, 401);
  assert.equal(
    (
      await app.call({ action: 'current' }, undefined, {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  const r = await app.call({ action: 'current' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).recipe, null);
  const disabled = await setup(t, { voiceKey: undefined });
  assert.equal((await disabled.call({ action: 'current' })).status, 404);
});

test('voice finds and opens a unique recipe but never chooses an ambiguous result', async (t) => {
  const app = await setup(t);
  const opened = await app.call({
    action: 'find',
    query: 'Garden soup',
    open: true,
  });
  assert.equal(opened.status, 200);
  const state = await opened.json();
  assert.equal(state.recipe.title, 'Garden soup');
  assert.equal(state.revision, 1);
  assert.equal(
    (await (await fetch(app.base + '/api/session')).json()).recipe.id,
    id,
  );
  const ambiguous = await setup(t, {
    fetchImpl: async () =>
      Response.json({
        items: [
          recipe,
          {
            ...recipe,
            id: '22345678-1234-4234-8234-123456789abc',
            name: 'Other soup',
          },
        ],
        total: 2,
        totalPages: 1,
      }),
  });
  const found = await (
    await ambiguous.call({ action: 'find', query: 'soup', open: true })
  ).json();
  assert.equal(found.needsChoice, true);
  assert.equal(
    (await (await ambiguous.call({ action: 'current' })).json()).recipe,
    null,
  );
  assert.equal(
    (
      await app.call({
        action: 'find',
        query: 'x',
        open: true,
        url: 'http://evil',
      })
    ).status,
    400,
  );
});

test('voice step control is revision checked, bounded and shares touch state', async (t) => {
  const app = await setup(t);
  assert.equal((await app.call({ action: 'next', revision: 0 })).status, 409);
  let state = await (
    await app.call({ action: 'find', query: 'soup', open: true })
  ).json();
  state = await (
    await app.call({ action: 'next', revision: state.revision })
  ).json();
  assert.equal(state.selected, 'a');
  const peek = await (await app.call({ action: 'current' })).json();
  assert.equal(peek.revision, state.revision);
  assert.equal(
    (await app.call({ action: 'goto', step: 99, revision: state.revision }))
      .status,
    400,
  );
  assert.equal((await app.call({ action: 'next', revision: 1 })).status, 409);
  state = await (
    await app.call({ action: 'goto', step: 2, revision: state.revision })
  ).json();
  assert.equal(state.selected, 'b');
  assert.equal(
    (await app.call({ action: 'next', revision: state.revision })).status,
    400,
  );
  state = await (
    await app.call({ action: 'previous', revision: state.revision })
  ).json();
  assert.equal(state.selected, 'a');
  state = await (
    await app.call({ action: 'finish', revision: state.revision })
  ).json();
  assert.equal(state.recipe, null);
});

test('session stream sends initial and committed revisions and requires browser pairing', async (t) => {
  const app = await setup(t);
  const controller = new AbortController();
  const response = await fetch(app.base + '/api/session/events', {
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"revision":0/);
  await app.call({ action: 'find', query: 'soup', open: true });
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.match(update, /"revision":1/);
  controller.abort();
  const paired = await setup(t, { requirePairing: true, accessKey: 'PAIR' });
  assert.equal((await fetch(paired.base + '/api/session/events')).status, 401);
});

test('unique title phrase wins over incidental Mealie description matches', async (t) => {
  const app = await setup(t, {
    fetchImpl: async (url) =>
      Response.json(
        String(url).includes('/recipes?')
          ? {
              items: [
                recipe,
                {
                  ...recipe,
                  id: '22345678-1234-4234-8234-123456789abc',
                  name: 'Chili',
                },
              ],
              total: 2,
            }
          : recipe,
      ),
  });
  const result = await (
    await app.call({ action: 'find', query: 'garden', open: true })
  ).json();
  assert.equal(result.recipe?.title, 'Garden soup');
});

test('a slow voice search cannot overwrite a newer touch action', async (t) => {
  let release, arrived;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    arrived = resolve;
  });
  const app = await setup(t, {
    fetchImpl: async (url) => {
      if (String(url).includes('/recipes?')) {
        arrived();
        await gate;
        return Response.json({ items: [recipe], total: 1 });
      }
      return Response.json(recipe);
    },
  });
  const pending = app.call({ action: 'find', query: 'soup', open: true });
  await entered;
  const touch = await fetch(app.base + '/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'finish', revision: 0 }),
  });
  assert.equal(touch.status, 200);
  release();
  assert.equal((await pending).status, 409);
  const state = await (await app.call({ action: 'current' })).json();
  assert.equal(state.revision, 1);
  assert.equal(state.recipe, null);
});
