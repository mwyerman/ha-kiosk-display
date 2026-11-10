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

## Docker

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
3. Test fixture UI via development mode first. Tap **Open recipe**, select the sample, scroll both columns independently, change servings, check ingredients, and select a step. Turn on timer/media previews and verify the last ingredient/step can scroll fully above the pills. Tap a timer for its explanatory modal; close it and finish cooking.
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
