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
- Superseded by the Phase 2 decision below: require the shared HA connection; do not add a backend proxy fallback.
- Timer APIs are implemented provisionally in Phase 2 below, Mealie deferred to Phase 3, Hermes actions/context to Phase 4.

## Phase 2 — documented bridge integration (2026-11-09)

### Setup and evidence

- User reports Kiosk Satellite **2026.11.8**, with the display app deployed on the LAN from GHCR. No direct Portal/HA access is available to the agent.
- Reference read: https://kiosksatellite.com/docs/js-api/ (current website; not a version-pinned confirmation of the installed build).
- `npm run check`: zero errors/warnings; `npm run build`: production builds successfully.
- `npm test`: eight Playwright browser tests pass, including three production tests with an injected bridge. These validate adapter logic, **not** Android/HA integration.
- Mock bridge coverage: initial fetch, timer change/finish events, pause/+1 minute/cancel, fixed paused time, deadline countdown without events, no locally manufactured completion, followed-player playback gating, reload snapshot recovery, shared HA denial with sanitized errors, and refresh after native screen-on.

### Implemented contract

- `window.kioskSatellite.getVoiceTimers()` and `kiosksatellite:voice-timers` provide authoritative timer snapshots. Countdown uses `ends_at` (epoch seconds/milliseconds or ISO timestamp); paused timers use `seconds_left`. Zero alone does not mark a timer finished. Epoch units will be confirmed on-device.
- Listen before fetching and ignore fetch responses overtaken by events/newer refreshes. Refresh on page show, visibility resume, focus, native screen-on, and HA-ready. Dispose listeners/interval on unmount. No timer persistence, engine, or browser alert audio.
- `controlVoiceTimer(id, action, duration)` provides pause/resume/cancel and +1 minute. Await native snapshots after actions and report false/rejected results without optimistic local changes. Finished alerts now offer **Dismiss**, mapped to native `cancel` (not an invented `dismiss` action). Cancellation is allowed for finished timers; other controls remain restricted to unfinished timers. Removal is never optimistic. Portal verification of finished cancellation stopping audio is still pending.
- `getKioskState()` plus `kiosksatellite:kiosk-state` supplies followed-player state/title/artist/source. Only `playing` produces a pill; no view changes. No speaker entity setting, album artwork, or media service controls in this implementation. Confirm that the followed player corresponds to the user's linked Sonos.
- Require shared HA access, checked with `ha.call({type: 'auth/current_user'})`; discard its result. No token in the page and no backend fallback. The timer/media bridge APIs operate independently, so HA errors are diagnostic rather than a reason to hide valid native state. No raw HA state/error messages are shown.
- Production only: development and fixture builds remain static previews. Outside the kiosk, production retains ambient/recipe placeholder and reports missing capabilities in `?diagnostics`.

### Portal acceptance / limitations — all pending

1. Enable **Share Home Assistant connection** under Home Assistant → Custom Pages. Check bridge version, timers/media and HA status in production `?diagnostics`.
2. Create multiple named timers by voice; verify running/paused deadlines and supported controls. Finish and dismiss an alert using the custom Dismiss button; confirm the native audio stops and the custom finished pill disappears.
3. Test reload during countdown, screen sleep/background/resume, and particularly **reload while ringing**. Documentation explicitly says document replacement clears native timer presentation and stops alert audio; it only explicitly promises restoration of countdowns. Ringing restoration is unknown, not guaranteed by this app.
4. Native overlays and alerts are not suppressed or reconfigured. Check duplicate UI and scrolling; only suppress native presentation later if configuration safely preserves alerts.
5. Play/pause the linked Sonos and change tracks. Verify title/artist and that recipes remain foregrounded. Native full-screen Now Playing settings are external to this page: leave them disabled for this product; diagnostics exposes `nowPlayingShown` but this app never opens or closes that overlay.
6. Verify actual locale/timezone and ambient clock after sleep. Local photo fallback and hidden empty surfaces are browser-verified; physical display acceptance remains pending.

### On-device feedback and timer fixes

- User confirms music/now-playing and basic timer display work on the Portal. Detailed pause/resume, multi-timer, and sleep checks are not yet reported.
- User reports countdown one second behind the native display. Changed display rounding from ceiling to floor, with a 100ms recompute cadence so a misaligned one-second interval does not add another second of lag. Countdown still clamps at zero and completion still requires a native finished snapshot. Device alignment after this change remains unverified.
- Added finished-timer cancellation through `controlVoiceTimer(id, 'cancel')`. All nine Playwright tests pass, including fractional-second boundary updates, successful cancellation, and failure retention/retry. `npm run check` reports zero errors/warnings and `npm run build` succeeds. Finished cancellation on the installed version remains unverified.
- User confirms reloading while ringing stops the alert. This is a **confirmed unresolved limitation**, not an assumed recovery guarantee. These changes do not modify native audio or implement a replacement alert engine.

No existing voice routing, wake-word configuration, timer ownership, Sonos configuration, or credentials were changed.
