# Integration observations

## Phase 1 — local browser validation (2026-11-09)

### Setup

- Agent host: Node v22.23.4, npm 10.9.9; exact dependency versions in `package-lock.json`.
- Automated checks: Playwright Chromium; 1280 × 800 and 1024 × 600 desktop viewports.
- Docker is not installed in this environment; Dockerfile/Compose execution is **unverified**. The GHCR Actions workflow and registry Compose deployment are configured, but actual workflow execution/publication and both architecture images still require validation on GitHub/the Docker host.
- No Portal, Kiosk Satellite, Home Assistant, or Hermes instance was accessible to the agent. No operational configuration was changed.

### Observed results

- `npm run check`: zero errors and warnings.
- `npm run build`: successful production build; fixture data/chunk absent.
- `npm test`: five browser tests pass. Coverage includes touch-style actions, independent scroll retention, floating-pill clearance for the final instruction, media not changing recipe view, native modal Escape/close, production fixture isolation, browser diagnostics, reload, and photo fallback at smaller landscape dimensions.
- Local sample photos load without runtime internet access. These are sample assets, not a connected personal photo library.
- Browser clock/date refresh periodically and on visibility/pageshow. Actual device sleep/resume remains untested.
- `npm audit`: three low-severity development-tool advisories associated with `deepmerge` through the Svelte Vite plugin/inspector; no upstream fix reported at implementation time. These packages are not included in the static nginx runtime. Recheck when updating the toolchain.

### Portal checks — not yet verified

Use the procedure in `README.md` and record results here. Do not mark Phase 1 accepted based on desktop tests.

| Check | Result / evidence |
|---|---|
| Kiosk Satellite version | Pending |
| Android / WebView version and ES2020/dialog/ResizeObserver support | Pending |
| Actual CSS viewport, visual viewport, device pixel ratio | Pending; use `?diagnostics` |
| Documented page/JS bridge access | Pending; inspect documentation for the installed build |
| Shared HA connection exposed and usable safely | Pending; diagnostics intentionally does not guess bridge methods |
| Ingredient/step independent scrolling and readable text | Pending |
| Keyboard, modal focus/dismissal, touch targets | Pending |
| Pills do not obscure final ingredient/instruction | Pending |
| Performance, reload, brightness, sleep/wake | Pending |
| Production has no development/simulation controls | Browser verified; Portal pending |

### Decisions and fallbacks

- The app fills the real viewport rather than scaling a fixed 1280 × 800 canvas. No permanent footer is reserved; actual floating surface height becomes extra scroll clearance.
- The production adapter is disconnected. Fixtures are dynamically loaded only in development or explicit `fixture` builds and have no simulation engines.
- If the installed build does not expose a safe shared HA connection, use an authenticated backend channel in Phase 2. Neither path is currently claimed as verified.
- Timer APIs are deferred to Phase 2 integration, Mealie to Phase 3, Hermes actions/context to Phase 4.
