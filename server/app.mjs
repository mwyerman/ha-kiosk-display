import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, sep, extname } from 'node:path';
import { realpath, stat, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const hash = (value) => createHash('sha256').update(value).digest();
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw fail(415, 'JSON required');
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16384) throw fail(413, 'Request too large');
  }
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw 0;
    return value;
  } catch {
    throw fail(400, 'Invalid JSON');
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id) => {
  if (typeof id !== 'string' || !uuid.test(id))
    throw fail(400, 'Invalid recipe ID');
  return id;
};
const string = (value) => (typeof value === 'string' ? value : '');
const nullable = (value) => (string(value).trim() ? value : null);
const summary = (r) => ({
  id: validId(r.id),
  title: string(r.name),
  photo: r.image ? `/api/recipe-images/${r.id}` : null,
  description: string(r.description),
});
function entries(items, prefix, map) {
  const used = new Set();
  return (Array.isArray(items) ? items : []).map((item, i) => {
    let id = string(item.referenceId) || string(item.id) || `${prefix}-${i}`;
    if (used.has(id)) id = `${prefix}-${i}`;
    while (used.has(id)) id += '-';
    used.add(id);
    return { id, ...map(item) };
  });
}
export function normalizeRecipe(r) {
  return {
    ...summary(r),
    servings:
      Number.isFinite(r.recipeServings) && r.recipeServings > 0
        ? r.recipeServings
        : null,
    yield: nullable(r.recipeYield),
    source: nullable(r.orgURL),
    ingredients: entries(r.recipeIngredient, 'ingredient', (i) => ({
      text:
        [i.display, i.originalText, i.note].find(
          (v) => typeof v === 'string' && v.trim(),
        ) ||
        [
          Number.isFinite(i.quantity) && i.quantity > 0
            ? String(i.quantity)
            : '',
          string(i.unit?.name),
          string(i.food?.name),
        ]
          .filter(Boolean)
          .join(' '),
      section: nullable(i.title),
    })),
    steps: entries(r.recipeInstructions, 'step', (i) => ({
      title: string(i.summary),
      text: string(i.text),
      section: nullable(i.title),
    })),
  };
}
async function bounded(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('size');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > limit) throw new Error('size');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createApp({
  accessKey,
  voiceKey,
  requirePairing = true,
  mealieUrl = 'https://mealie.helios.mxwy.org',
  mealieKey = '',
  fetchImpl = fetch,
  staticDir,
  dbPath = ':memory:',
  cookieSecure = false,
  allowedOrigins = [],
} = {}) {
  if (requirePairing && (typeof accessKey !== 'string' || !accessKey.trim()))
    throw new Error('Kiosk access key is required');
  if (dbPath !== ':memory:')
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS auth (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kitchen (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL);
    INSERT OR IGNORE INTO kitchen VALUES(1,'{"revision":0,"recipe":null,"checked":[],"selected":null}');`);
  const readSession = () =>
    JSON.parse(
      db.prepare('SELECT snapshot FROM kitchen WHERE id=1').get().snapshot,
    );
  const upstreamBase = new URL(mealieUrl);
  if (
    !['http:', 'https:'].includes(upstreamBase.protocol) ||
    upstreamBase.username ||
    upstreamBase.password
  ) {
    db.close();
    throw new Error('Invalid Mealie URL configuration');
  }
  const upstream = async (path, limit = 2097152, image = false) => {
    try {
      const response = await fetchImpl(
        new URL(
          upstreamBase.pathname.replace(/\/$/, '') + path,
          upstreamBase.origin,
        ),
        {
          headers: { authorization: `Bearer ${mealieKey}` },
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('upstream');
      }
      const bytes = await bounded(response, limit);
      return image
        ? { bytes, type: response.headers.get('content-type') }
        : JSON.parse(bytes.toString('utf8'));
    } catch {
      throw fail(502, 'Mealie is unavailable; try again later');
    }
  };
  const getRecipe = async (id) =>
    normalizeRecipe(await upstream(`/api/recipes/${validId(id)}`));
  let writes = Promise.resolve();
  const sessionClients = new Set();
  const publishSession = (revision) => {
    const frame = `data: ${JSON.stringify({ revision })}\n\n`;
    for (const client of sessionClients) {
      if (!client.write(frame)) client.destroy();
    }
  };
  const mutateSession = async (input) => {
    const fields = {
      open: ['type', 'recipeId', 'revision'],
      check: ['type', 'ingredientId', 'checked', 'revision'],
      select: ['type', 'stepId', 'revision'],
      finish: ['type', 'revision'],
    };
    if (
      !Object.hasOwn(fields, input.type) ||
      Object.keys(input).some((k) => !fields[input.type].includes(k)) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0
    )
      throw fail(400, 'Invalid session action');
    const state = readSession();
    if (state.revision !== input.revision)
      throw fail(409, 'Session changed; reload and try again');
    if (input.type === 'open') {
      state.recipe = await getRecipe(input.recipeId);
      state.checked = [];
      state.selected = null;
    }
    if (input.type === 'finish') {
      state.recipe = null;
      state.checked = [];
      state.selected = null;
    }
    if (input.type === 'check') {
      if (
        typeof input.checked !== 'boolean' ||
        !state.recipe?.ingredients.some((i) => i.id === input.ingredientId)
      )
        throw fail(400, 'Invalid ingredient');
      state.checked = state.checked.filter((id) => id !== input.ingredientId);
      if (input.checked) state.checked.push(input.ingredientId);
    }
    if (input.type === 'select') {
      if (
        input.stepId !== null &&
        !state.recipe?.steps.some((s) => s.id === input.stepId)
      )
        throw fail(400, 'Invalid step');
      state.selected = input.stepId;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (readSession().revision !== input.revision)
        throw fail(409, 'Session changed; reload and try again');
      state.revision++;
      db.prepare('UPDATE kitchen SET snapshot=? WHERE id=1').run(
        JSON.stringify(state),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    publishSession(state.revision);
    return state;
  };
  const attempts = new Map();
  const queueMutation = (input) => {
    const action = writes.then(() => mutateSession(input));
    writes = action.catch(() => {});
    return action;
  };
  const voiceAction = async (input) => {
    if (input.action === 'current' && Object.keys(input).length === 1)
      return readSession();
    if (input.action === 'find') {
      if (
        Object.keys(input).some(
          (k) => !['action', 'query', 'open'].includes(k),
        ) ||
        typeof input.query !== 'string' ||
        !input.query.trim() ||
        input.query.length > 200 ||
        typeof input.open !== 'boolean'
      )
        throw fail(400, 'Invalid recipe search');
      const revision = readSession().revision;
      const query = new URLSearchParams({
        search: input.query.trim(),
        page: '1',
        perPage: '20',
      });
      const result = await upstream(`/api/recipes?${query}`);
      const items = (result.items || []).slice(0, 20).map(summary);
      const total = Number(result.total) || 0;
      const exact = items.filter(
        (r) =>
          r.title.toLocaleLowerCase() ===
          input.query.trim().toLocaleLowerCase(),
      );
      const titleMatches = items.filter((r) =>
        r.title
          .toLocaleLowerCase()
          .includes(input.query.trim().toLocaleLowerCase()),
      );
      const complete = total <= 20 && Number(result.totalPages || 1) <= 1;
      const match =
        complete && exact.length === 1
          ? exact[0]
          : complete && titleMatches.length === 1
            ? titleMatches[0]
            : total === 1 && items.length === 1
              ? items[0]
              : null;
      if (input.open && match)
        return queueMutation({ type: 'open', recipeId: match.id, revision });
      return {
        items,
        total,
        needsChoice: input.open && total > 1,
        opened: false,
      };
    }
    if (['next', 'previous', 'goto', 'finish'].includes(input.action)) {
      const fields =
        input.action === 'goto'
          ? ['action', 'revision', 'step']
          : ['action', 'revision'];
      if (
        Object.keys(input).some((k) => !fields.includes(k)) ||
        !Number.isSafeInteger(input.revision) ||
        input.revision < 0
      )
        throw fail(400, 'Invalid voice control');
      const state = readSession();
      if (state.revision !== input.revision)
        throw fail(
          409,
          'Session changed; read the current recipe and ask the user to retry',
        );
      if (!state.recipe) throw fail(409, 'No recipe is open');
      if (input.action === 'finish')
        return queueMutation({ type: 'finish', revision: input.revision });
      const steps = state.recipe.steps;
      const current = steps.findIndex((s) => s.id === state.selected);
      const index =
        input.action === 'goto'
          ? input.step - 1
          : input.action === 'next'
            ? current + 1
            : current - 1;
      if (
        (input.action === 'goto' && !Number.isSafeInteger(input.step)) ||
        index < 0 ||
        index >= steps.length
      )
        throw fail(
          400,
          'That step is outside the recipe; your place is unchanged',
        );
      return queueMutation({
        type: 'select',
        stepId: steps[index].id,
        revision: input.revision,
      });
    }
    throw fail(400, 'Invalid voice action');
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
        if (!staticDir || !['GET', 'HEAD'].includes(req.method))
          throw fail(404, 'Not found');
        let path;
        try {
          path = decodeURIComponent(url.pathname);
        } catch {
          throw fail(404, 'Not found');
        }
        if (
          path.includes('\\') ||
          path.includes('\0') ||
          path
            .split('/')
            .some(
              (p) =>
                p.startsWith('.') ||
                ['server', 'data', 'node_modules'].includes(p),
            )
        )
          throw fail(404, 'Not found');
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
          '.webp': 'image/webp',
          '.jpg': 'image/jpeg',
          '.woff2': 'font/woff2',
          '.webmanifest': 'application/manifest+json',
          '.txt': 'text/plain; charset=utf-8',
        };
        const root = await realpath(staticDir);
        let target = resolve(root, '.' + path);
        const fileRequest =
          path.startsWith('/assets/') || Boolean(extname(path));
        if (!fileRequest || path === '/') target = resolve(root, 'index.html');
        if (
          !types[extname(target)] ||
          (fileRequest &&
            !path.startsWith('/assets/') &&
            ![
              '/index.html',
              '/favicon.ico',
              '/manifest.webmanifest',
              '/robots.txt',
              '/photos/ambient.jpg',
              '/photos/pasta.jpg',
            ].includes(path))
        )
          throw fail(404, 'Not found');
        try {
          const actual = await realpath(target);
          if (!actual.startsWith(root + sep) || actual === resolve(dbPath))
            throw fail(404, 'Not found');
          const info = await stat(actual);
          if (!info.isFile() || info.size > 16777216)
            throw fail(404, 'Not found');
          const content = req.method === 'HEAD' ? null : await readFile(actual);
          res.writeHead(200, {
            'content-type': types[extname(target)],
            'content-length': info.size,
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-cache',
          });
          return res.end(content);
        } catch {
          throw fail(404, 'Not found');
        }
      }
      if (url.pathname === '/api/health' && req.method === 'GET')
        return json(res, 200, { ok: true });
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw fail(403, 'Request origin not allowed');
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        const expected = `${cookieSecure ? 'https' : 'http'}://${req.headers.host}`;
        if (
          req.headers['sec-fetch-site'] === 'cross-site' ||
          (origin && origin !== expected && !allowedOrigins.includes(origin))
        )
          throw fail(403, 'Request origin not allowed');
      }
      if (url.pathname === '/api/pair' && req.method === 'POST') {
        if (!requirePairing) throw fail(404, 'Pairing is disabled');
        const now = Date.now();
        for (const [ip, a] of attempts) if (a.until < now) attempts.delete(ip);
        const ip = req.socket.remoteAddress;
        const a = attempts.get(ip) || { count: 0, until: now + 60000 };
        if (a.count >= 10 || attempts.size > 10000)
          throw fail(429, 'Too many pairing attempts; try again later');
        a.count++;
        attempts.set(ip, a);
        const input = await body(req);
        if (
          typeof input.key !== 'string' ||
          !timingSafeEqual(hash(input.key), hash(accessKey))
        )
          throw fail(401, 'Invalid pairing key');
        const token = randomBytes(32).toString('base64url');
        db.prepare('DELETE FROM auth WHERE expires < ?').run(now);
        db.prepare('INSERT INTO auth VALUES (?,?)').run(
          hash(token).toString('hex'),
          now + 31536000000,
        );
        res.setHeader(
          'set-cookie',
          `kiosk_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${cookieSecure ? '; Secure' : ''}`,
        );
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/voice' && req.method === 'POST') {
        if (!voiceKey) throw fail(404, 'Voice control is disabled');
        const bearer = /^Bearer (\S+)$/.exec(
          req.headers.authorization || '',
        )?.[1];
        if (!bearer || !timingSafeEqual(hash(bearer), hash(voiceKey)))
          throw fail(401, 'Voice authentication required');
        return json(res, 200, await voiceAction(await body(req)));
      }
      const token = /(?:^|;\s*)kiosk_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
        req.headers.cookie || '',
      )?.[1];
      if (
        requirePairing &&
        (!token ||
          !db
            .prepare('SELECT 1 FROM auth WHERE token=? AND expires>?')
            .get(hash(token).toString('hex'), Date.now()))
      )
        throw fail(401, 'Pair this kiosk first');
      if (url.pathname === '/api/session' && req.method === 'GET')
        return json(res, 200, readSession());
      if (url.pathname === '/api/session/events' && req.method === 'GET') {
        if (sessionClients.size >= 32)
          throw fail(503, 'Too many session subscribers');
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no',
        });
        res.write(
          `retry: 2000\ndata: ${JSON.stringify({ revision: readSession().revision })}\n\n`,
        );
        sessionClients.add(res);
        const heartbeat = setInterval(() => {
          if (!res.write(': keepalive\n\n')) res.destroy();
        }, 15000);
        heartbeat.unref();
        res.once('close', () => {
          clearInterval(heartbeat);
          sessionClients.delete(res);
        });
        return;
      }
      if (url.pathname === '/api/session' && req.method === 'POST') {
        const input = await body(req);
        return json(res, 200, await queueMutation(input));
      }
      if (url.pathname === '/api/recipes' && req.method === 'GET') {
        const search = url.searchParams.get('search') || '';
        const page = url.searchParams.get('page') || '1';
        if (search.length > 200 || !/^[1-9][0-9]{0,3}$/.test(page))
          throw fail(400, 'Invalid recipe search or page');
        const query = new URLSearchParams({ search, page, perPage: '20' });
        const result = await upstream(`/api/recipes?${query}`);
        return json(res, 200, {
          items: (result.items || []).slice(0, 20).map(summary),
          page: Number(page),
          totalPages: Number(result.totalPages) || 0,
          total: Number(result.total) || 0,
        });
      }
      if (
        url.pathname.startsWith('/api/recipe-images/') &&
        req.method === 'GET'
      ) {
        const id = validId(url.pathname.slice('/api/recipe-images/'.length));
        const image = await upstream(
          `/api/media/recipes/${id}/images/min-original.webp`,
          8388608,
          true,
        );
        if (
          !['image/webp', 'image/png', 'image/jpeg', 'image/gif'].includes(
            image.type,
          )
        )
          throw fail(502, 'Mealie is unavailable; try again later');
        res.writeHead(200, {
          'content-type': image.type,
          'content-length': image.bytes.length,
          'cache-control': 'private, max-age=3600',
          'x-content-type-options': 'nosniff',
        });
        // Validate the bounded upstream stream before committing response headers.
        // This permits a sanitized 502 even when an unknown-length body is oversized.
        await pipeline(
          Readable.from(
            (function* () {
              for (let offset = 0; offset < image.bytes.length; offset += 65536)
                yield image.bytes.subarray(offset, offset + 65536);
            })(),
          ),
          res,
        );
        return;
      }
      if (url.pathname.startsWith('/api/recipes/') && req.method === 'GET')
        return json(
          res,
          200,
          await getRecipe(url.pathname.slice('/api/recipes/'.length)),
        );
      throw fail(404, 'Not found');
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      json(res, error.status || 500, {
        error: error.status ? error.message : 'Request failed',
      });
    }
  });
  server.once('close', () => db.close());
  return server;
}
