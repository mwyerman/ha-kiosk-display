import { createApp } from './app.mjs';

try {
  const env = process.env;
  if (
    env.KIOSK_REQUIRE_PAIRING !== undefined &&
    !['true', 'false'].includes(env.KIOSK_REQUIRE_PAIRING)
  )
    throw new Error('Invalid pairing configuration');
  const requirePairing = env.KIOSK_REQUIRE_PAIRING !== 'false';
  if (requirePairing && !env.KIOSK_ACCESS_KEY?.trim())
    throw new Error('Kiosk access key is required');
  if (
    env.COOKIE_SECURE !== undefined &&
    !['true', 'false'].includes(env.COOKIE_SECURE)
  )
    throw new Error('Invalid cookie security configuration');
  const port = Number(env.PORT ?? 5176);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid port configuration');
  const host = env.HOST || '127.0.0.1';

  const server = createApp({
    mealieUrl: env.MEALIE_URL || 'https://mealie.helios.mxwy.org',
    mealieKey: env.MEALIE_API_KEY || '',
    accessKey: env.KIOSK_ACCESS_KEY,
    voiceKey: env.KIOSK_VOICE_KEY,
    requirePairing,
    dbPath: env.SESSION_DB || './data/kiosk.sqlite',
    staticDir: env.STATIC_DIR || undefined,
    cookieSecure: env.COOKIE_SECURE === 'true',
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  });
  server.once('error', () => {
    console.error('Kiosk server could not listen');
    process.exit(1);
  });
  server.listen(port, host, () =>
    console.log(`Listening on http://${host}:${server.address().port}`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      server.close(() => process.exit(0));
      server.closeAllConnections();
    });
} catch (error) {
  console.error(
    error.message === 'Kiosk access key is required'
      ? error.message
      : 'Kiosk server could not start; check configuration',
  );
  process.exitCode = 1;
}
