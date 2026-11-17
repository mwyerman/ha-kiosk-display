# Live Portal development on EOS

## Locations

- Source checkout in Hermes: `/opt/data/workspaces/hs-kiosk-display` (directory spelling is intentional; repository is `mwyerman/ha-kiosk-display`, branch `initial-work`).
- Test URL: `https://kiosk-dev.eos.mxwy.org/` (`?diagnostics` opens diagnostics).
- Internal upstream: `http://hermes:5175` on Docker's existing `proxy` network. No host port is published.
- Traefik dynamic file on EOS: `/home/mwyerman/docker/traefik/dynamic/kiosk-dev.yaml`.
- Versioned route template: `docs/kiosk-dev.traefik.yaml`.
- Production remains separately managed at `/home/mwyerman/docker-infra/eos/ha-kiosk-display/compose.yaml`, port 8090.

The user confirms `*.eos.mxwy.org` is local-only. No public DNS record or WAN forwarding was added. Vite allows this specific hostname, not arbitrary hosts. This is a development source server, not a public hosting endpoint.

## Start and stop

From the checkout:

```sh
export PATH=/opt/data/tools/node/bin:$PATH
npm ci                         # first checkout / dependency changes only
npm run dev:kiosk
```

For an agent-managed session, run the last command using the terminal tool with `background=true`, workdir set to this checkout. Retain the returned process session ID. Verify readiness with an HTTPS request to the test URL (no TLS bypass), not a blind sleep. Stop that exact tracked process using `process_manage` (load its schema first); do not kill broad process-name matches. In a foreground shell, Ctrl-C stops Vite.

The route is persistent; the dev process is intentionally on demand, not a boot service. Restart it after a Hermes container restart/recreation or when it has been stopped. When it is not running, the test hostname will return a proxy error; production stays available. No Hermes or Traefik restart is required to run Vite.

## Modes

### Recipe backend (leave running alongside Vite)

The live frontend needs the API on `127.0.0.1:5176`; a working page alone does not
prove readiness. Start `server/index.mjs` with Node 24+ and the approved Mealie key
in process environment (retrieve from EOS stack `.env` without printing or copying
it into served source). Local preview uses `KIOSK_REQUIRE_PAIRING=false`,
`HOST=127.0.0.1`, `PORT=5176`,
`ALLOWED_ORIGINS=https://kiosk-dev.eos.mxwy.org`, and
`SESSION_DB=/opt/data/workspaces/hs-kiosk-display/data/kiosk.sqlite`.
No second key/pairing prompt is needed for this local preview. Anyone who can
reach the preview can read recipes and change its shared session. Cross-site
origin protection remains enabled. The Compose deployment also explicitly selects unpaired trusted-LAN mode. The CLI
still fails closed unless that mode is explicitly selected or a pairing key is set.

Luna recipe voice control additionally needs the separate `KIOSK_VOICE_KEY` in
the API process environment, matching Luna's profile-scoped secret. Do not use the
Mealie token for this. See `voice-recipes.md` for plugin settings, test commands,
the shared-dev-session scope and rollback. Without this key, voice control is
disabled; ordinary browser recipes still work.

Keep both development processes running after validation. Check the actual HTTPS
URL's `/api/health`, `/api/session`, and `/api/recipes` as well as the page/picker.
Reusing a live Vite process means edits are immediately visible on the Portal;
inspect running processes before edits, not just before starting a new server.
These are background development processes, not reboot/container-restart services.

- `npm run dev`: existing static-fixture UI on port 5173, live integration disabled.
- `npm run dev:kiosk`: Vite mode `kiosk`, port 5175, real native timers/media/HA bridge, no fixture controls. Outside Kiosk Satellite it reports missing bridge capabilities; it does not fabricate state.
- `npm run build`: production output remains fixture-free.

Port 5174 is reserved for the automated live-development test server; it is not the proxy upstream.

## Fast iteration, final regression check

During exploratory UX work, edit and let the user try the live dev page immediately. Use quick compile/readiness checks only; defer full browser suites, screenshot matrices and CI/image-build waits until the design is accepted for final commit/push. Update affected tests and run the suite once at that point. This lighter cadence does not waive verification for service logic, security or production deployments.

1. Start `dev:kiosk` and configure the Portal's Kiosk Satellite Custom Page URL to `https://kiosk-dev.eos.mxwy.org/`. Keep Share Home Assistant connection enabled as needed by the existing bridge integration. Do not change voice routing, native alert ownership, or speaker settings.
2. Make scoped source changes and regression tests. Vite hot reloads edits via the same HTTPS hostname; no image build/push is required.
3. Timers start as compact pills; tap a running/paused timer to slide out Pause/Resume, +1 min and End, and tap again to collapse. Only one timer expands at once. End opens inline End timer?/Keep confirmation. Finished timers are compact, one-tap dismiss links using `ks://voice/stop`. The user accepted this sliding UX on the Portal. Timer state/audio remain native-owned.
4. Hot updates may replace the document or reattach the bridge. Reloading while ringing is already known to stop native alert audio; do not count a reload/HMR-triggered stop as evidence that Dismiss worked. Let source edits settle, then create a fresh timer for acceptance.
5. Run `npm run check` and `npm test`. Local container browser override: `LD_LIBRARY_PATH=/opt/data/tools/chromium-libs npm test -- --config playwright.local.config.ts`. This untracked machine-specific file selects the installed Chromium; normal CI uses `playwright.config.ts`.
6. Ask the user to confirm the Portal behavior before publishing/deploying. Pushing this branch automatically tests and publishes GHCR images, but does not update the running production container. Deploy production only when explicitly approved, using pinned SSH and checkout Compose; preserve the previous image and verify the running revision and served app.
7. To return the Portal to production, restore its existing port-8090 URL. This setup does not change the device URL automatically.

## Route lifecycle

The route template defines a single TLS router and upstream; Traefik's existing file provider watches its dynamic directory. To change routing, read the current remote target and check for concurrent changes, back it up outside the watched directory, publish atomically, read back the exact file, then verify TLS, HTTP and the HMR WebSocket. Never overwrite other dynamic routes or change Hermes Compose just to expose the dev server. Removing only this route file reverses the proxy addition (requires approval). No credentials belong in this repository or served source.

## Verification at setup

- 10 Playwright tests passed, including live-development bridge snapshots/controls with an injected bridge and fixture isolation; Svelte check had zero errors/warnings.
- Real test hostname: HTTPS 200 with trusted certificate, HMR WebSocket connected, no page errors, zero fixture controls. Native Portal behavior still requires user acceptance.
