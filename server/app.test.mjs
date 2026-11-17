import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { once } from 'node:events';
import { createApp } from './app.mjs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, createServer } from 'node:http';
const withHost = (url, data, headers) =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers }),
        );
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(data));
  });

const scratch = join(tmpdir(), 'kiosk-');
async function setup(t, options = {}) {
  const dir = await mkdtemp(scratch + 'kiosk-server-');
  let server;
  const start = async (extra = {}) => {
    server = createApp({
      mealieUrl: 'http://127.0.0.1:1',
      mealieKey: 'UPSTREAM_SECRET',
      accessKey: 'PAIR_SECRET',
      dbPath: dir + '/db.sqlite',
      ...options,
      ...extra,
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => {
    if (server?.listening) await new Promise((r) => server.close(r));
  };
  let base = await start();
  t.after(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    get base() {
      return base;
    },
    close,
    restart: async (extra) => {
      await close();
      base = await start(extra);
    },
    request: (path, init) => fetch(base + path, init),
    pair: async () => {
      const r = await fetch(base + '/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'PAIR_SECRET' }),
      });
      assert.equal(r.status, 200);
      return r.headers.get('set-cookie');
    },
  };
}
const post = (body, cookie, headers = {}) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(cookie ? { cookie } : {}),
    ...headers,
  },
  body: JSON.stringify(body),
});

test('explicit local-only mode needs no pairing but retains origin checks', async (t) => {
  const app = await setup(t, { accessKey: undefined, requirePairing: false });
  assert.equal((await app.request('/api/session')).status, 200);
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ type: 'finish', revision: 0 }, null, {
          origin: 'https://evil.example',
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await app.request('/api/session', post({ type: 'finish', revision: 0 })))
      .status,
    200,
  );
  assert.equal(
    (await app.request('/api/pair', post({ key: 'unused' }))).status,
    404,
  );
});

test('pairing persists hashed opaque cookies across restarts and enforces CSRF', async (t) => {
  const app = await setup(t, {
    cookieSecure: true,
    allowedOrigins: ['https://kiosk.example'],
  });
  assert.equal(
    (await app.request('/api/pair', post({ key: 'wrong' }))).status,
    401,
  );
  assert.equal(
    (
      await app.request(
        '/api/pair',
        post({ key: 'PAIR_SECRET' }, null, { origin: 'https://evil.example' }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request(
        '/api/pair',
        post({ key: 'PAIR_SECRET' }, null, { 'sec-fetch-site': 'cross-site' }),
      )
    ).status,
    403,
  );
  const cookie = await app.pair();
  assert.match(cookie, /kiosk_session=[A-Za-z0-9_-]{43};/);
  for (const flag of [
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Secure',
    'Max-Age=',
  ])
    assert.ok(cookie.includes(flag));
  assert.deepEqual(
    await (await app.request('/api/session', { headers: { cookie } })).json(),
    { revision: 0, recipe: null, checked: [], selected: null },
  );
  await app.restart();
  assert.equal(
    (await app.request('/api/session', { headers: { cookie } })).status,
    200,
  );
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(app.dir + '/db.sqlite');
  assert.ok(
    !JSON.stringify(db.prepare('SELECT * FROM auth').all()).includes(
      cookie.split(';')[0].split('=')[1],
    ),
  );
  db.close();
});

test('pair attempts are rate limited', async (t) => {
  const app = await setup(t);
  let r;
  for (let i = 0; i < 11; i++)
    r = await app.request('/api/pair', post({ key: 'wrong' }));
  assert.equal(r.status, 429);
});

const recipeId = '12345678-1234-4234-8234-123456789abc';
const rawRecipe = {
  id: recipeId,
  name: 'Soup',
  image: 'abc',
  description: '<b>Exact</b>',
  recipeServings: 0,
  recipeYield: 'one large pot',
  orgURL: 'https://example.com/soup',
  recipeIngredient: [
    {
      referenceId: 'salt',
      display: '  ½ tsp salt  ',
      originalText: 'WRONG',
      quantity: 999,
      title: 'Broth',
    },
    { originalText: 'A pinch of pepper', quantity: 0 },
    { note: 'to taste', quantity: 0 },
    { quantity: 2, unit: { name: 'cups' }, food: { name: 'water' } },
    { quantity: 0, food: { name: 'herbs' } },
  ],
  recipeInstructions: [
    {
      id: 'boil',
      summary: 'Boil gently',
      title: 'Broth',
      text: 'Do not scale.',
    },
    { text: 'Serve.' },
  ],
};

test('recipes preserve original ingredient text and expose only normalized fields', async (t) => {
  const calls = [];
  const app = await setup(t, {
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(
        String(url).includes('/recipes?')
          ? { items: [rawRecipe], page: 1, totalPages: 2, total: 21 }
          : rawRecipe,
      );
    },
  });
  const cookie = await app.pair();
  const list = await (
    await app.request('/api/recipes?search=soup&page=1', {
      headers: { cookie },
    })
  ).json();
  assert.deepEqual(list, {
    items: [
      {
        id: recipeId,
        title: 'Soup',
        photo: `/api/recipe-images/${recipeId}`,
        description: '<b>Exact</b>',
      },
    ],
    page: 1,
    totalPages: 2,
    total: 21,
  });
  const recipe = await (
    await app.request(`/api/recipes/${recipeId}`, { headers: { cookie } })
  ).json();
  assert.deepEqual(recipe, {
    id: recipeId,
    title: 'Soup',
    photo: `/api/recipe-images/${recipeId}`,
    description: '<b>Exact</b>',
    servings: null,
    yield: 'one large pot',
    source: 'https://example.com/soup',
    ingredients: [
      { id: 'salt', text: '  ½ tsp salt  ', section: 'Broth' },
      { id: 'ingredient-1', text: 'A pinch of pepper', section: null },
      { id: 'ingredient-2', text: 'to taste', section: null },
      { id: 'ingredient-3', text: '2 cups water', section: null },
      { id: 'ingredient-4', text: 'herbs', section: null },
    ],
    steps: [
      {
        id: 'boil',
        title: 'Boil gently',
        text: 'Do not scale.',
        section: 'Broth',
      },
      { id: 'step-1', title: '', text: 'Serve.', section: null },
    ],
  });
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.authorization, 'Bearer UPSTREAM_SECRET');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const count = calls.length;
  for (const path of [
    '/api/recipes/nope',
    '/api/recipes?page=0',
    '/api/recipes?page=10001',
    '/api/recipes?search=' + 'x'.repeat(201),
  ])
    assert.equal(
      (await app.request(path, { headers: { cookie } })).status,
      400,
    );
  assert.equal(calls.length, count);
});

test('upstream failures are sanitized', async (t) => {
  const app = await setup(t, {
    fetchImpl: async () => {
      throw new Error('UPSTREAM_SECRET https://secret');
    },
  });
  const cookie = await app.pair();
  const r = await app.request(`/api/recipes/${recipeId}`, {
    headers: { cookie },
  });
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), {
    error: 'Mealie is unavailable; try again later',
  });
});

test('kitchen session mutations serialize, persist snapshots and reject stale or invalid writes', async (t) => {
  let calls = 0;
  const app = await setup(t, {
    fetchImpl: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return Response.json(rawRecipe);
    },
  });
  const cookie = await app.pair();
  const mutate = (b) => app.request('/api/session', post(b, cookie));
  const competing = await Promise.all([
    mutate({ type: 'open', recipeId, revision: 0 }),
    mutate({ type: 'open', recipeId, revision: 0 }),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  assert.equal(calls, 1);
  let state = await competing.find((r) => r.status === 200).json();
  assert.equal(state.revision, 1);
  assert.equal(state.recipe.id, recipeId);
  assert.equal(
    (
      await mutate({
        type: 'check',
        ingredientId: 'salt',
        checked: true,
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await mutate({
        type: 'check',
        ingredientId: 'invalid',
        checked: true,
        revision: 1,
      })
    ).status,
    400,
  );
  assert.equal(
    (await mutate({ type: 'select', stepId: 'invalid', revision: 1 })).status,
    400,
  );
  assert.equal(
    (await mutate({ type: 'finish', revision: 1, deviceId: 'bedroom' })).status,
    400,
  );
  state = await (
    await mutate({
      type: 'check',
      ingredientId: 'salt',
      checked: true,
      revision: 1,
    })
  ).json();
  assert.deepEqual(state.checked, ['salt']);
  state = await (
    await mutate({ type: 'select', stepId: 'boil', revision: 2 })
  ).json();
  assert.equal(state.selected, 'boil');
  await app.restart({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.deepEqual(
    await (await app.request('/api/session', { headers: { cookie } })).json(),
    state,
  );
  assert.equal(
    (await mutate({ type: 'open', recipeId, revision: 3 })).status,
    502,
  );
  assert.deepEqual(
    await (await app.request('/api/session', { headers: { cookie } })).json(),
    state,
  );
  assert.deepEqual(
    await (await mutate({ type: 'finish', revision: 3 })).json(),
    { revision: 4, recipe: null, checked: [], selected: null },
  );
});

test('image proxy allowlists paths and types and bounds upstream content', async (t) => {
  let mode = 'ok';
  let target;
  const app = await setup(t, {
    fetchImpl: async (url) => {
      target = String(url);
      return new Response(
        mode === 'large' ? new Uint8Array(8388609) : 'image-bytes',
        {
          headers: {
            'content-type': mode === 'html' ? 'text/html' : 'image/webp',
          },
        },
      );
    },
  });
  const cookie = await app.pair();
  let r = await app.request(`/api/recipe-images/${recipeId}`, {
    headers: { cookie },
  });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'image-bytes');
  assert.equal(
    target,
    `http://127.0.0.1:1/api/media/recipes/${recipeId}/images/min-original.webp`,
  );
  assert.equal(r.headers.get('content-type'), 'image/webp');
  assert.match(r.headers.get('cache-control'), /private/);
  assert.equal(
    (await app.request('/api/recipe-images/not-uuid', { headers: { cookie } }))
      .status,
    400,
  );
  for (mode of ['html', 'large'])
    assert.equal(
      (
        await app.request(`/api/recipe-images/${recipeId}`, {
          headers: { cookie },
        })
      ).status,
      502,
    );
});

test('static hosting serves SPA routes but never missing assets or private files', async (t) => {
  const app = await setup(t);
  const dist = app.dir + '/dist';
  await mkdir(dist + '/assets', { recursive: true });
  await writeFile(dist + '/index.html', '<html>kiosk</html>');
  await writeFile(dist + '/assets/app.js', 'console.log(1)');
  await mkdir(dist + '/photos');
  await writeFile(dist + '/photos/ambient.jpg', 'ambient-photo');
  await writeFile(dist + '/.env', 'SECRET');
  await symlink(app.dir + '/db.sqlite', dist + '/assets/leak.js');
  await app.restart({ staticDir: dist });
  assert.equal(await (await app.request('/')).text(), '<html>kiosk</html>');
  assert.equal(
    await (await app.request('/cook/soup')).text(),
    '<html>kiosk</html>',
  );
  assert.equal(
    await (await app.request('/assets/app.js')).text(),
    'console.log(1)',
  );
  assert.equal(
    await (await app.request('/photos/ambient.jpg')).text(),
    'ambient-photo',
  );
  for (const path of [
    '/assets/missing.js',
    '/missing.png',
    '/.env',
    '/server/app.mjs',
    '/db.sqlite',
    '/assets/leak.js',
    '/%2eenv',
    '/assets/%2e%2e/.env',
  ])
    assert.equal((await app.request(path)).status, 404, path);
  assert.equal((await app.request('/api/missing')).status, 401);
  const cookie = await app.pair();
  assert.equal(
    (await app.request('/api/missing', { headers: { cookie } })).status,
    404,
  );
});

test('CLI starts from env, parses cookie security and fails safely without access key', async (t) => {
  const dir = await mkdtemp(scratch + 'kiosk-cli-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function launch(env) {
    const child = spawn(process.execPath, ['server/index.mjs'], {
      env: {
        PATH: process.env.PATH,
        HOST: '127.0.0.1',
        PORT: '0',
        SESSION_DB: dir + '/cli.sqlite',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    return { child, output: () => output };
  }
  const unpaired = await launch({
    KIOSK_REQUIRE_PAIRING: 'false',
    HOST: '0.0.0.0',
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error('Unpaired LAN mode did not start'));
    }, 3000);
    const timer = setInterval(() => {
      if (/Listening on http:\/\/0.0.0.0:\d+/.test(unpaired.output())) {
        clearTimeout(timeout);
        clearInterval(timer);
        resolve();
      }
    }, 10);
  });
  const lanPort = unpaired.output().match(/0.0.0.0:(\d+)/)[1];
  assert.equal(
    (await fetch(`http://127.0.0.1:${lanPort}/api/session`)).status,
    200,
  );
  unpaired.child.kill();
  await once(unpaired.child, 'exit');
  for (const value of ['true', 'false']) {
    const p = await launch({
      KIOSK_ACCESS_KEY: 'CLI_SECRET',
      COOKIE_SECURE: value,
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(timer);
        reject(new Error('CLI did not listen: ' + p.output()));
      }, 5000);
      const timer = setInterval(() => {
        if (/Listening on http:\/\/127.0.0.1:\d+/.test(p.output())) {
          clearTimeout(timeout);
          clearInterval(timer);
          resolve();
        }
      }, 10);
    });
    const base = p.output().match(/http:\/\/127.0.0.1:\d+/)[0];
    const r = await fetch(base + '/api/pair', post({ key: 'CLI_SECRET' }));
    assert.equal(r.status, 200);
    assert.equal(
      r.headers.get('set-cookie').includes('; Secure'),
      value === 'true',
    );
    assert.ok(!p.output().includes('CLI_SECRET'));
    p.child.kill();
    await once(p.child, 'exit');
  }
  const p = await launch({ MEALIE_API_KEY: 'DONT_LOG_ME' });
  const [code] = await once(p.child, 'exit');
  assert.equal(code, 1);
  assert.match(p.output(), /access key/i);
  assert.ok(!p.output().includes('DONT_LOG_ME'));
});

test('mutation validation bounds input, ignores forwarded scheme and preserves Vite Host', async (t) => {
  const app = await setup(t);
  const hosted = await withHost(
    app.base + '/api/pair',
    { key: 'PAIR_SECRET' },
    { host: 'kiosk.example:5174', origin: 'http://kiosk.example:5174' },
  );
  assert.equal(hosted.status, 200);
  assert.ok(!hosted.headers['set-cookie'][0].includes('; Secure'));
  let r = await app.request(
    '/api/pair',
    post({ key: 'PAIR_SECRET' }, null, {
      origin: 'https://kiosk.example',
      'x-forwarded-proto': 'https',
      host: 'kiosk.example',
    }),
  );
  assert.equal(r.status, 403);
  const cookie = await app.pair();
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ type: 'finish', revision: 0 }, cookie, {
          origin: 'https://evil.example',
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request('/api/session', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{broken',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ junk: 'x'.repeat(17000) }, cookie),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ type: 'finish', revision: 0 }, cookie, {
          'content-type': 'text/plain',
        }),
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ type: 'select', revision: 0 }, cookie),
      )
    ).status,
    400,
  );
});

test('real upstream HTTP keeps credentials on configured host and rejects redirects', async (t) => {
  let redirected = false;
  const trap = createServer((req, res) => {
    redirected = true;
    res.end('{}');
  });
  trap.listen(0, '127.0.0.1');
  await once(trap, 'listening');
  t.after(() => new Promise((r) => trap.close(r)));
  let mode = 'ok';
  const upstream = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer UPSTREAM_SECRET');
    if (mode === 'redirect') {
      res.writeHead(302, {
        location: `http://127.0.0.1:${trap.address().port}/capture`,
      });
      return res.end();
    }
    if (mode === 'error') {
      res.writeHead(500);
      return res.end('UPSTREAM_SECRET internal detail');
    }
    res.setHeader('content-type', 'application/json');
    res.end(mode === 'large' ? 'x'.repeat(2097153) : JSON.stringify(rawRecipe));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise((r) => upstream.close(r)));
  const app = await setup(t, {
    mealieUrl: `http://127.0.0.1:${upstream.address().port}`,
  });
  for (const path of [
    '/api/recipes',
    `/api/recipes/${recipeId}`,
    `/api/recipe-images/${recipeId}`,
    '/api/session',
  ])
    assert.equal((await app.request(path)).status, 401);
  const cookie = await app.pair();
  assert.equal(
    (await app.request(`/api/recipes/${recipeId}`, { headers: { cookie } }))
      .status,
    200,
  );
  for (mode of ['redirect', 'error', 'large']) {
    const r = await app.request(`/api/recipes/${recipeId}`, {
      headers: { cookie },
    });
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), {
      error: 'Mealie is unavailable; try again later',
    });
  }
  assert.equal(redirected, false);
});

test('cross-site fetch metadata is rejected for authenticated reads', async (t) => {
  const app = await setup(t);
  const cookie = await app.pair();
  assert.equal(
    (
      await app.request('/api/session', {
        headers: { cookie, 'sec-fetch-site': 'cross-site' },
      })
    ).status,
    403,
  );
});

test('open requires a string UUID and does not coerce array IDs', async (t) => {
  let calls = 0;
  const app = await setup(t, {
    fetchImpl: async () => {
      calls++;
      return Response.json(rawRecipe);
    },
  });
  const cookie = await app.pair();
  assert.equal(
    (
      await app.request(
        '/api/session',
        post({ type: 'open', recipeId: [recipeId], revision: 0 }, cookie),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});

test('health is public but startup requires an access key', async (t) => {
  assert.throws(() => createApp({}), /access key/i);
  const app = await setup(t);
  assert.deepEqual(await (await app.request('/api/health')).json(), {
    ok: true,
  });
  assert.equal((await app.request('/api/session')).status, 401);
});
