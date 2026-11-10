# HA Kiosk Display

A locally hosted kitchen display for Kiosk Satellite, based on [`mockup.html`](mockup.html). See [`PLAN.md`](PLAN.md) for scope and progress.

## Phase 1 status

Svelte 5 + TypeScript + Vite frontend, with ambient and recipe views, independent scrollable ingredients/instructions, touch serving/check/highlight controls, floating timer/music presentation, accessible modal, transient feedback, and browser diagnostics.

**Not connected to live services yet.** Production starts in ambient mode; tapping it explains that recipe access is not connected. Development includes a fixture recipe and **static** timer/music previews. There is no timer engine, mock voice parser, backend, persistence, or full-screen Now Playing. Touch fixture session state resets on reload. Portal acceptance is still pending.

## Local development

Requires Node 22 and npm.

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

Both image variants serve static files through unprivileged nginx on container port **8080**. The fixture variant is a preview, not a live integration or development server.

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

Open `http://<docker-host-LAN-IP>:8080` and use that URL in Kiosk Satellite. Once merged, you can use `fixture-latest`. The production equivalents are `initial-work` and `latest`; production currently shows ambient only because real recipe access is not implemented yet.

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

If deploying through a Docker UI, select `ghcr.io/mwyerman/ha-kiosk-display:fixture-initial-work`, map host port 8080 to container port 8080, and set restart policy `unless-stopped`. Add GHCR credentials in that UI if keeping the package private. No volumes or application secrets are required in Phase 1.

## Docker (build locally)

```sh
docker compose up --build -d display
# Production: http://<host-LAN-IP>:8080

docker compose --profile dev up --build dev
# Fixture-enabled development: http://<host-LAN-IP>:5173
```

The production image serves static files as an unprivileged nginx user. The dev service mounts `src/` and `public/` for live edits; rebuild it after dependency/config changes. `docker build -t ha-kiosk-display .` also defaults to production. This image has not yet been run in the agent environment (Docker unavailable).

Only expose this service on a trusted LAN or behind an appropriate reverse proxy. No credentials are needed in Phase 1. Future service credentials must remain server-side. These are relative-path local assets, not runtime third-party requests.

## Portal setup and acceptance

1. Deploy on a machine reachable from the Portal; use its LAN address, not `localhost`.
2. In the installed Kiosk Satellite's Custom Page configuration, set the URL to the development or production URL above. Exact labels/API availability depend on the installed version; do not replace the working Assist/timer/Sonos setup.
3. Test fixture UI via the registry fixture image or development mode first. Tap **Open recipe**, select the sample, scroll both columns independently, change servings, check ingredients, and select a step. Turn on timer/media previews and verify the last ingredient/step can scroll fully above the pills. Tap a timer for its explanatory modal; close it and finish cooking.
4. Open **Diagnostics**, or append `?diagnostics` to any app URL. Capture the report and type into the notes field to test the on-screen keyboard. Notes are temporary and never uploaded. Diagnostics reports browser metrics only; **it does not verify bridge or HA access**.
5. Test reload, network interruption/recovery, photo failure, landscape sizing, touch accuracy, and smooth scrolling. Background/resume the page and confirm the clock catches up. Observe brightness/sleep/wake behavior without changing the existing kiosk configuration blindly.
6. Load production and confirm no preview controls, fixture recipe, music, or timer pills appear. Tap ambient to check the empty recipe explanation and close it.
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
- `src/lib/model.ts`: small presentation adapter contracts and disconnected production defaults.
- `src/lib/fixtures.ts`: development/fixture-mode data, excluded from production bundles.
- `src/App.svelte`: transient UI state and surface-height measurement. No durable cooking state yet; Phase 3 will move session ownership to the controller.
- `public/photos/`: local sample images; sources in `docs/assets.md`.

Do not treat the Phase 1 presentation contracts as verified Kiosk Satellite API shapes. Timer/media ownership remains with native services in later phases.
