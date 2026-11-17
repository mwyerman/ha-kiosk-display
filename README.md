# HA Kiosk Display

A locally hosted kitchen display for Kiosk Satellite, based on [`mockup.html`](mockup.html). See [`PLAN.md`](PLAN.md) for scope and progress.

## Current implementation

Svelte 5 + TypeScript + Vite frontend, with ambient and recipe views, independent scrollable ingredients/instructions, plain-text ingredients and step highlighting, floating timer/music presentation, accessible modal, transient feedback, and browser diagnostics. Recipes preserve original quantities; there are no serving-adjustment controls. The accepted recipe screen uses a faint background image, translucent reading surfaces and compact step headings; the recipe picker is a full-screen grid without automatic keyboard focus.

**Phase 3 implemented and Portal layout accepted; deployment approved.** Native timers and followed-player metadata use Kiosk Satellite's documented JavaScript API. The new production backend supplies Mealie search and persistent cooking sessions; see [`docs/mealie.md`](docs/mealie.md) for configuration and pairing. Ordinary development still includes a fixture recipe and **static** timer/music previews (live integration disabled); fixture state resets on reload. No replacement timer engine, mock voice parser, or full-screen Now Playing is implemented. Portal acceptance of Mealie remains pending.

## Local development

For the EOS Portal live-test URL, start/stop instructions, proxy configuration and test-before-deploy procedure, see [`docs/local-kiosk-development.md`](docs/local-kiosk-development.md). `npm run dev:kiosk` uses the real native bridge with hot reload; ordinary `npm run dev` remains a static-fixture preview.

Requires Node 24+ and npm. Mealie/backend setup is documented in [`docs/mealie.md`](docs/mealie.md).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`, or `http://<host-LAN-IP>:5173` on the Portal. Development preview controls appear at the top. They are deliberately absent from production. The dev server is LAN-accessible: use a trusted network, not internet port forwarding.

```sh
npm run check
npm run build
npm run preview       # production preview at :4173; no fixtures
```

For a **static, explicitly non-production** fixture build on a test host:

```sh
npx vite build --mode fixture --outDir dist-fixture
npx vite preview --outDir dist-fixture --host 0.0.0.0 --port 4174
```

Do not deploy `dist-fixture` as production. Query parameters cannot enable fixtures in the production build. `mockup.html` remains an unchanged simulation reference; it is not copied into the deployed app.

## Deploy from GitHub Container Registry (recommended)

GitHub Actions tests the app and builds **linux/amd64 and linux/arm64** images at:

```text
ghcr.io/mwyerman/ha-kiosk-display
```

Both image variants listen on container port **8080**. Production uses an unprivileged Node server for the app, Mealie API and SQLite cooking session; fixtures remain static nginx previews, not live integrations or development servers. See [`docs/mealie.md`](docs/mealie.md) for required production secrets and volume persistence.

| Tag | Contents / update source |
|---|---|
| `latest` | Production, latest successful default-branch build (`main`) |
| `fixture-latest` | Static fixture preview, latest successful default-branch build |
| `initial-work` | Production from the `initial-work` branch |
| `fixture-initial-work` | Static fixture preview from the `initial-work` branch |
| `v1.2.3` / `fixture-v1.2.3` | Production / preview for a pushed `v1.2.3` tag |
| `sha-<full-commit>` / `fixture-sha-<full-commit>` | Commit-specific production / preview tags |

Branch tags are updated on successful builds. Pull requests run tests and container builds but **never publish**. The workflow can also be run manually from GitHub Actions. `latest` tags appear only after a successful build on the default branch; until this branch is merged, use `fixture-initial-work` or `initial-work`.

### First publication / registry access

1. Push `.github/workflows/images.yml` to GitHub and wait for **Test and publish container images** to complete in the repository's **Actions** tab. No custom publishing token is needed: the workflow uses `GITHUB_TOKEN` with job-scoped `packages: write` permission.
2. After the first publication, check the `ha-kiosk-display` package under the owner's **Packages** page. GHCR packages are private by default; repository visibility alone does not make the image public. To allow anonymous pulls, change the package visibility to **Public** under its package settings. Only do this if public distribution is intended.
3. For a private package instead, log in on your Docker host with a GitHub personal access token (classic) with `read:packages` and access to this package:

   ```sh
   read -rsp 'GitHub package read token: ' GHCR_TOKEN; echo
   printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   unset GHCR_TOKEN
   ```

   Never put that token in a Compose file or commit it. If an existing GHCR package rejects workflow publication, ensure the repository has Actions access in that package's settings.

### Run on your Docker host

Copy [`compose.registry.yaml`](compose.registry.yaml) to any directory on the Docker host, or paste its contents into your Docker management UI as a stack. No repository checkout, Node, or local build is needed.

For the current Portal test, use the **fixture** image. Until merged into `main`:

```sh
IMAGE_TAG=fixture-initial-work docker compose -f compose.registry.yaml pull
IMAGE_TAG=fixture-initial-work docker compose -f compose.registry.yaml up -d
```

Open `http://<docker-host-LAN-IP>:8080` and use that URL in Kiosk Satellite. Once merged, you can use `fixture-latest`. The production equivalents are `initial-work` and `latest`. New Phase 3 production builds also require Mealie/pairing configuration and a persistent volume; they resume the cooking session or show ambient, with real timer/music pills when reported by Kiosk Satellite.

For a persistent configuration, create a local `.env` next to the Compose file (do not commit credentials):

```dotenv
IMAGE_TAG=fixture-initial-work
DISPLAY_PORT=8080
```

Then run:

```sh
docker compose -f compose.registry.yaml pull
docker compose -f compose.registry.yaml up -d
docker compose -f compose.registry.yaml logs --tail=50
```

These same `pull` and `up -d` commands update a running deployment after a successful Actions build. Restarting a container alone does **not** fetch a newer image. Pin a commit tag or image digest instead of a moving branch tag for controlled updates/rollback. If port 8080 is occupied, set `DISPLAY_PORT=8090` and open port 8090 instead. Stop any earlier source-built service using the same port before starting this deployment.

If deploying a static fixture preview through a Docker UI, select `ghcr.io/mwyerman/ha-kiosk-display:fixture-initial-work`, map host port 8080 to container port 8080, and set restart policy `unless-stopped`. Add GHCR credentials in that UI if keeping the package private. Static fixture images need no application secrets; production requires the configuration and volume in `docs/mealie.md`.

## Docker (build locally)

```sh
docker compose up --build -d display
# Production: http://<host-LAN-IP>:8080

docker compose --profile dev up --build dev
# Fixture-enabled development: http://<host-LAN-IP>:5173
```

The production image runs the app/API as an unprivileged Node user with persistent state in `/data`. The dev service mounts `src/` and `public/` for live edits; rebuild it after dependency/config changes. `docker build -t ha-kiosk-display .` also defaults to production. This image has not yet been run in the agent environment (Docker unavailable).

Only expose this service on a trusted LAN or behind an appropriate reverse proxy. Production service credentials remain server-side. Fixture assets remain local; real recipe content/images are obtained through the backend from configured Mealie.

## Phase 2 live integration

Use the **production** image/tag or `npm run dev:kiosk`, not `fixture-*` or ordinary `npm run dev` (fixture modes never invoke live APIs).

1. In Kiosk Satellite, enable **Settings → Home Assistant → Custom Pages → Share Home Assistant connection**. The app uses this shared connection; there is no browser token or backend HA proxy.
2. Open the production URL as a Custom Page. Append `?diagnostics` to inspect integration status; close the modal to use the display normally. Do not share credentials or raw HA state when reporting issues.
3. Create a short named timer by voice. Check its pill, pause/resume, +1 minute, cancel, and completion. Finished state comes from the kiosk, not from reaching zero locally. Use **Dismiss** on a finished timer to open the native `ks://voice/stop` action. The pill stays until the kiosk confirms removal. Verify that this also stops the native alert on your installed version; see the live-development procedure for reload/HMR caveats.
4. Play/pause the kiosk's configured followed speaker. Its title/artist pill should appear only while playing. No entity ID is needed for this read-only integration. Album art and media controls are not implemented.
5. Test sleep/wake, reload while running, multiple timers, and **reload while ringing**. Documentation says document replacement stops native alert audio; automatic restoration of ringing is not established. This app neither plays alert audio nor modifies native timer overlays.
6. Keep the kiosk's automatic native full-screen Now Playing disabled if enabled in your existing configuration. The app never opens it, but cannot prevent an independently configured native overlay. Diagnostics reports whether the kiosk says it is shown.

Timer and media snapshots are fetched on load and resume (`visibilitychange`, `pageshow`, focus, and native screen-on), with live events between snapshots. Timer display uses native deadlines; paused time stays fixed. Shared HA failures are reported in diagnostics without disabling independent native timer observation. No HA proxy or simulated production state is used.

## Portal setup and acceptance

1. Deploy on a machine reachable from the Portal; use its LAN address, not `localhost`.
2. In the installed Kiosk Satellite's Custom Page configuration, set the URL to the development or production URL above. Exact labels/API availability depend on the installed version; do not replace the working Assist/timer/Sonos setup.
3. Test fixture UI via the registry fixture image or development mode first. Tap **Open recipe**, select the sample, scroll both columns independently, verify original servings, check ingredients, and select a step. Turn on timer/media previews and verify the last ingredient/step can scroll fully above the pills. Tap a timer for its explanatory modal; close it and finish cooking.
4. Open **Diagnostics**, or append `?diagnostics` to any app URL. Capture the report and type into the notes field to test the on-screen keyboard. Notes are temporary and never uploaded. Production diagnostics reports bridge version, timer/media availability, shared HA access, last timer snapshot time, and browser metrics. Fixture builds do not connect to live services.
5. Test reload, network interruption/recovery, photo failure, landscape sizing, touch accuracy, and smooth scrolling. Background/resume the page and confirm the clock catches up. Observe brightness/sleep/wake behavior without changing the existing kiosk configuration blindly.
6. Load production and confirm no preview controls or fixture data appear. Real timer/music pills should appear only when the kiosk reports relevant state. Tap ambient to pair and open a Mealie recipe; test reload restoration without disturbing native timers. See `docs/mealie.md`.
7. Record installed Kiosk Satellite/Android WebView versions and the results in [`docs/integrations.md`](docs/integrations.md). Bridge inspection requires the installed version's actual API documentation; do not infer support from desktop browser behavior or guess native bridge methods.

Initial target is 1280 × 800 landscape, with responsive layout also browser-tested at 1024 × 600. The WebView must support ES2020, ResizeObserver, and native HTML dialog. Its actual version/compatibility remains an on-device check; a compatibility fallback may be needed for an old WebView.

## Tests and visual references

```sh
npx playwright install chromium
npm test
```

Tests start development and production-preview servers, exercise recipe touch behavior and scroll retention, floating surface clearance, modal dismissal, production fixture isolation, diagnostics, reload, and missing-photo/smaller-viewport behavior. Screenshots are generated under `test-results/` for comparison with `mockup.html`; they are review artifacts, not approved pixel-diff baselines. Desktop tests cannot establish Portal performance or native APIs.

## Code boundaries

- `src/components/`: views and presentation surfaces.
- `src/lib/model.ts`: small presentation contracts and empty initial state.
- `src/lib/kiosk.ts`: production bridge adapter, deadline countdowns, timer controls, followed-player state, and sanitized diagnostics.
- `src/lib/fixtures.ts`: development/fixture-mode data, excluded from production bundles.
- `src/App.svelte`: touch UI orchestration and surface-height measurement; production cooking state is owned by the backend.
- `server/`: same-origin Mealie adapter, pairing and persistent SQLite cooking session; see `docs/mealie.md`.
- `public/photos/`: local sample images; sources in `docs/assets.md`.

Do not treat the Phase 1 presentation contracts as verified Kiosk Satellite API shapes. Timer/media ownership remains with native services in later phases.
