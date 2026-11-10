# HA Kiosk Display — Implementation Plan

> **Status:** Working implementation roadmap for future coding agents.  
> **Project:** `mwyerman/ha-kiosk-display`  
> **Initial device:** rooted Meta/Facebook Portal 10 (2nd generation), Kiosk Satellite, landscape (~1280 × 800 target).  
> **First profile:** kitchen.  
> **Scope exclusion:** Automatic/full-screen Now Playing is **deferred**. Do not implement it during these phases unless separately requested.

## Progress tracking

Task and acceptance checkboxes are the source of truth for completion. Phase numbers describe implementation order; reference sections are intentionally unnumbered.

- `[ ]` means incomplete (including in progress or blocked); `[x]` means completed and verified.
- When starting work, add a log entry identifying the phase/task and mark it **In progress**. Record blockers explicitly rather than checking off blocked work.
- Check off tasks as they are verified. Check off a phase's acceptance gate only when **all** its criteria pass, including required on-device tests. Desktop tests or mocks do not substitute for Portal verification.
- Each work session, update the log with changes, verification evidence (commands/results or links), remaining work, and blockers. Use **Done**, **In progress**, or **Blocked**; do not mark a phase done for partial implementation.
- Validate integrations within the phase that uses them, not as a separate prerequisite workstream. Build the real integration where practical; use small diagnostic checks only for genuinely uncertain capabilities. Bundle user/device checks with that phase's acceptance testing rather than arranging separate test runs.
- Keep detailed integration findings in `docs/integrations.md` and link them from the log, including test setup, software versions, observed behavior, limitations, and chosen fallbacks. Proposed APIs or untested code are not verified work.
- The recommended PR list is packaging guidance, not a second completion checklist. The MVP checklist is the final cross-phase release gate.

### Completion log

Implementation progress is recorded below (newest first).

| Date | Phase / task | Status | Changes and verification evidence | Remaining work / blockers |
|---|---|---|---|---|
| 2026-11-09 | Phase 1 — registry deployment | In progress | Added Actions browser checks and multi-architecture production/fixture image publication to GHCR, standalone `compose.registry.yaml`, and registry deployment instructions. Local type checks and five browser tests pass. | Actual Actions publication, GHCR visibility/access setup, Docker image execution, and Portal acceptance remain pending. |
| 2026-11-09 | Phase 1 — app foundation and prototype port | In progress | Svelte/TypeScript component port, static fixture adapters, disconnected production defaults, Docker/Compose configuration, and setup/diagnostic docs implemented. `npm run check` and `npm run build` pass; five Playwright tests pass. See `docs/integrations.md` and `README.md`. | Portal bridge/HA access, visual/touch/performance/keyboard/sleep acceptance remain unverified. Docker configuration is supplied but not run (Docker unavailable in agent environment). |

## Purpose and starting point

Build a polished, voice-first kitchen display using a custom locally hosted web app running in Kiosk Satellite's WebView. Keep the experience visually faithful to the **Hearth Kitchen v7** HTML prototype, while replacing simulated controls with real integrations. The kitchen is the first use case of a potential multi-device framework, **not** a mandate to build a generic framework now.

**Source material / precedence:**

1. `concept.md` in this repository records exploratory product intent, especially the kitchen behavior, UI principles, and potential future multi-device design. It explicitly is not a fixed specification.
2. `mockup.html` (the Hearth Kitchen v7 prototype in this repository) is the visual/interaction starting point. Preserve its design intent, not its demo implementation details.
3. This plan sequences the work, adds implementation recommendations and validation gates. If user requirements change, update this file instead of treating it as immutable.

**Already working in the user's environment:** Kiosk Satellite voice to Home Assistant Assist, Whisper, Piper, local Hermes-backed LLM, Sonos-linked music, and **voice-created timers** via the conversation routing setup. Avoid breaking those systems.

**Starting repository state:** `README.md`, `concept.md`, `mockup.html`, and this plan; no established application code structure. Verify current repository contents before any edits.

### Desired behavior

- **Cooking session active:** Show recipe with photograph, ingredients, and several visible instructions. Music may play but must not displace recipe content. Show compact music status only when actually playing.
- **No cooking session:** Show ambient/photo-frame view with large clock/date. For now, music playback must not automatically switch to full-screen Now Playing.
- **Timers:** Independent of recipe and music. Voice-first creation; multiple named timers; floating custom-styled pills only when needed; clear completion feedback without replacing the main view.
- **Contextual voice:** The assistant can answer questions about the **currently displayed** recipe and perform allowlisted actions such as changing steps, servings, opening/closing recipes, and setting timers.
- **Recipes:** Primarily Mealie, with later support for Hermes web discovery and user-approved Mealie import.

### Design guardrails

- Visual fidelity matters: custom CSS/layout/animations, not a Lovelace-like UI.
- No permanent top chrome, navigation tabs, empty timer bar, or arbitrary status badges.
- Recipe ingredients and instructions scroll independently; multiple steps visible at once. Highlighting is optional, not forced sequential navigation.
- Touch targets and text must remain readable at kitchen viewing distance on a 10-inch landscape device.
- Do not implement parallel timer or music engines. Treat the existing underlying services as authoritative.
- No full-screen Now Playing work in this plan; a compact music pill is in scope.
- Keep actual WebView size/performance tests ahead of premature abstractions.

## Proposed architecture (validate before locking in)

```text
Portal / Kiosk Satellite
  ├─ Existing voice pipeline → Home Assistant Assist → Hermes + Whisper/Piper
  ├─ Custom WebView kitchen SPA (visual UI and local transient interaction)
  └─ Native timer events/control (if API works as expected on device)
                      │
                      ├──── Home Assistant API/WS → Sonos media_player
                      │
                      └──── Small app controller (HTTP + WebSocket)
                                ├─ Per-device cooking/session state
                                ├─ Mealie adapter (credentials only server-side)
                                └─ Validated semantic actions/context for Hermes

Hermes ── allowlisted tools/API ── app controller ── updates broadcast to SPA
```

**Recommended approach:** Docker-hosted Svelte + TypeScript + Vite frontend with a minimal backend/controller and small persistent store (SQLite is sufficient as a candidate). This is a proposal, **not** a settled stack. A smaller proof-of-concept can begin in plain HTML/JS if that speeds validation. The server should own durable per-device cooking-session state; the page can own transient scroll/animation state. Home Assistant need not be the recipe state store.

**Do not assume** Kiosk Satellite's `extra_system_prompt` is delivered to Hermes in the existing routing setup; investigate it during Phase 4 as an optional optimization, not a prerequisite. Likewise, do not assume JavaScript APIs work from an arbitrary browser: verify the custom page and bridge availability on the Portal during Phase 1, then timer capabilities during Phase 2.

### Ownership boundaries

| Responsibility | Intended owner |
|---|---|
| Kiosk voice capture/playback | Kiosk Satellite + existing HA Assist pipeline |
| Speech-to-text / text-to-speech | Existing Whisper / Piper |
| Intent interpretation and recipe tool use | Hermes |
| Native timers, alerts | Kiosk Satellite / existing timer integration |
| Sonos playback state and commands | Home Assistant `media_player` / Sonos |
| Recipe source of truth | Mealie |
| Current recipe, servings, selected step, checked items | App controller (persisted per device/session) |
| Display layout and presentation | Custom web frontend |
| Clock | Browser local time (device timezone configured correctly) |
| Photos | Local hosted photo collection, eventually |

## Phase 1 — Web app foundation and physical display

**Goal:** Reproduce the prototype on the real Portal, reliably.

Tasks:

- [x] Preserve `mockup.html` as the visual reference, clearly marked as a simulation; do not accidentally deploy its mock command parser/timer engine as production behavior. See `docs/assets.md`; the reference is unchanged and excluded from deployment.
- [ ] Establish development and Docker deployment, local URL, production build, and Kiosk Satellite Custom Page configuration. **Implemented:** Vite development/build, production and development Docker targets, Compose services, and configuration instructions in `README.md`. **Pending:** run Docker deployment and configure/test the actual Portal.
- [ ] As soon as the app shell loads on the Portal, verify viewport dimensions, access to the documented page/JS bridge, and whether a usable HA shared connection is exposed. Use a small diagnostic surface in the app if needed; record the available APIs in `docs/integrations.md`. If the HA connection is unavailable or unsuitable, plan an authenticated backend channel for Phase 2.
- [x] Create core screen components: `AmbientView`, `RecipeView`, `TimerPills`, `MusicPill`, `Overlay/Modal`, and a transient voice/status surface. Implemented under `src/components/`; `Modal` uses native dialog focus handling.
- [ ] Match the prototype's visual hierarchy: green/cream palette, large recipe photo, left ingredient column, right steps column, optional bottom floating surfaces, large ambient clock. **Implemented and browser-reviewed** at 1280 × 800; final visual verification on the Portal is pending. Sample photos are local, with an illustrative pasta image rather than the mockup's exact recipe photo.
- [x] Use initial fixture data and simulated states **behind well-defined adapters** so the UI can be tested without live services. Presentation contracts in `src/lib/model.ts`; static fixtures only in development/explicit fixture builds. Production has no fixture recipe, timers, or music; no mock service engines or command parser.
- [ ] Verify actual viewport/resolution, touch/scroll behavior, on-screen keyboard, WebView performance, reload behavior and display brightness/sleep behavior.
- [x] Preserve independent scroll positions where reasonable; ensure overlays cannot permanently obstruct the end of lists. Reactive touch updates retain scroll positions; measured floating-surface height adds dynamic scroll clearance. Covered by browser tests; actual device ergonomics remain part of acceptance.

- [ ] **Acceptance:** Cooking and ambient views work by touch in Kiosk Satellite on the Portal; demo fixtures render cleanly and match the intended composition; no development/simulation controls appear in production mode.

## Phase 2 — Native timers, Sonos and ambient clock

**Goal:** Replace mock time/media behavior while retaining custom visuals.

### Timers

- [ ] Begin timer integration on the Portal with a voice-created named timer: verify whether custom-page APIs/events can enumerate it, receive updates and completion, and control/dismiss it. Check native overlay behavior alongside the custom pills. Record actual API support before committing to the adapter contract; if unavailable, investigate supported HA timer state/event integration rather than building a replacement timer engine.
- [ ] Build a `TimerAdapter` against the **verified** timer API/events; reconcile initial fetch, event updates, reconnect and page reload.
- [ ] Render one pill per active/finished timer with labels and accurate remaining time. Prefer deadline-based display calculation over decrementing a JS integer each second.
- [ ] Wire pause/resume/add time/cancel/dismiss only where the verified API supports them. Retain graceful behavior for unsupported controls.
- [ ] Ensure completion state and alert output remain correct if the UI is sleeping, backgrounded or reloaded. Native timer ownership should survive page reload.
- [ ] Suppress duplicate native timer UI only if supported by configuration without disabling alerts.

### Media

- [ ] Read the kitchen Sonos `media_player` entity state, title/artist/art and playback status using the existing HA connection or a secure backend proxy.
- [ ] Show the compact music pill **only when playback is active**; optionally allow a small set of play/pause/skip controls through HA services.
- [ ] Playing music while cooking must not switch views. **Do not build or auto-open full-screen Now Playing.**

### Ambient

- [ ] Implement browser clock/date with locale and timezone correctness; refresh appropriately after sleep/resume.
- [ ] Start with fixed local photo fixtures; later allow a local folder/library and safe fallback images.
- [ ] No empty footer when there are no timers and no relevant media state.

- [ ] **Acceptance:** Real voice timers appear and finish correctly; Sonos play/pause metadata reflects actual playback; ambient clock is accurate after resume; recipes remain foregrounded during music playback.

## Phase 3 — Mealie recipes and cooking sessions (first useful MVP)

**Goal:** Make the kitchen usable for real recipes without requiring voice control yet.

Tasks:

- [ ] Add server-side Mealie integration using the deployed LAN URL and API token; keep tokens and base URL in environment/secrets, never in frontend bundles or browser local storage. Verify connectivity from the actual backend host as part of implementation, not a separate proof-of-concept.
- [ ] Search/list recipes and fetch a full recipe by stable identifier; support pictures, title, ingredients, quantities/units, instructions, original servings, and attribution where available.
- [ ] Define an internal normalized recipe schema with explicit handling for absent fields, instruction sections, nonnumeric quantities, and unit-dependent scaling. Exercise search, full-recipe retrieval, images, and normalization against several actual Mealie recipes; capture representative sanitized fixtures and version-specific findings.
- [ ] Provide touch-driven recipe selection/open/close, checked ingredients, highlighted step, and serving multiplier.
- [ ] Persist per-device cooking sessions (recipe ID, servings, selected step, checked item IDs, active/inactive status); restore after reload.
- [ ] Keep recipe content in Mealie or a bounded server cache; do not stuff entire recipes into Home Assistant entities or one large device-state object.
- [ ] Build a modest on-screen recipe picker/search; retain the prototype's multi-step scrollable book layout.
- [ ] Define a robust policy for missing images, changing/deleted Mealie recipes, and reconnection.

- [ ] **Acceptance:** Select a Mealie recipe, adjust servings, check ingredients, highlight/scroll steps, reload the page and recover session state. Timers and music continue independently.

## Phase 4 — Hermes recipe context and actions

**Goal:** Natural voice questions and UI actions grounded in the currently displayed recipe.

### Preferred reliable baseline: context read + semantic tools

- [ ] Add a small, restricted command/context API, and expose it to Hermes through the integration mechanism **actually supported by the installed Hermes environment** (e.g. a locally hosted MCP tool server or supported HTTP-tool integration). Avoid arbitrary browser JS execution or arbitrary HA service access for recipe commands.

Suggested interface (names are illustrative):

```text
recipe_get_context()
recipe_search(query)
recipe_open(recipe_id)
recipe_select_step(step_number)
recipe_set_servings(servings)
recipe_finish()
```

- [ ] `recipe_get_context()` should return enough for accurate questions: active recipe title/source, servings, ingredient list (including units/amounts), ordered instructions, selected/highlighted step, and relevant metadata. Return stable identifiers and concise bounded data; fetch large content in chunks if needed.

- [ ] The controller validates each command, changes the authoritative per-device session, and broadcasts state changes to the UI. Frontend touch actions call the same controller to avoid divergence.
- [ ] Implement Hermes-to-controller device targeting as part of the real tool integration. Verify with an actual recipe action that a normal voice request reaches the intended kitchen session and updates the display. If the originating satellite identity is not conveyed reliably, use a fixed server-side kitchen-only tool target for v1 and document the single-device limitation; never trust the model to invent device IDs.

### Optional optimization: pipeline context injection

- [ ] During Phase 4 voice testing, investigate Kiosk Satellite's documented `pipelineRun` / `extra_system_prompt` support through the **normal wake-word path**. A manual `pipelineRun({extra_system_prompt: ...})` call alone does not establish normal-path support. Record exact behavior and software versions. If supported, send a short, fresh summary of the active recipe/step; otherwise document the limitation and retain `recipe_get_context()`. Never use prompt text alone to mutate UI. This investigation is not a gate for the baseline voice integration; if deferred, leave it unchecked and note that in the log.

### Test voice interactions

- [ ] “How much cream do I need?” → correct amount at the currently selected servings.
- [ ] “When do I add the basil?” → grounded answer without requiring step navigation.
- [ ] “Show me where it says to add the basil.” → select and scroll to relevant step.
- [ ] “Make it for six people.” → update servings and UI.
- [ ] “What step am I on?” → current highlighted step.
- [ ] “Finish cooking.” → exit cooking view, preserve timer state.
- [ ] “Set an eight-minute pasta timer.” → still uses existing native timer handling.

- [ ] **Acceptance:** Same recipe state is observable from touch and Hermes; voice interactions target the right kiosk; reloads do not desynchronize; the model cannot bypass validated commands.

## Phase 5 — Hermes web recipe discovery and import

**Goal:** Find recipes beyond the existing Mealie collection.

Tasks:

- [ ] Let Hermes search the web for recipes and provide source references/options without inventing ingredient measurements.
- [ ] Prefer using Mealie's supported URL import pathway for a chosen recipe; confirm supported URL formats and API behavior for the deployed Mealie version.
- [ ] Have the user confirm which recipe to import/save. Do not automatically save arbitrary web search output or scraped recipe text.
- [ ] Validate successful Mealie import and retrieve the canonical recipe before display; communicate failures clearly.
- [ ] Support fallback where import is unavailable: show the source/link or offer a temporary non-persisted recipe preview only if parsing can be validated.
- [ ] Display source attribution and avoid presenting model-generated substitutes as an imported original recipe.

- [ ] **Acceptance:** “Find a butter chicken recipe” → Hermes offers sourced options → user selects one → confirmed import to Mealie → opens in the existing recipe view.

## Phase 6 — Refinement, reliability and framework extraction

Tasks:

- [ ] Refine exact typography, spacing, transitions, voice feedback placement, and touch ergonomics against on-device photos/video and user feedback.
- [ ] Add real local photo-library rotation and sensible cache behavior.
- [ ] Handle offline conditions, WebSocket reconnection, API failures, stale data, server restart and resume from device sleep.
- [ ] Add targeted automated tests (normalization, serving math, action validation, session persistence), plus manual on-device acceptance checks.
- [ ] Define deployment rollback/versioning, secrets handling, safe LAN exposure and monitoring/logging without recording private voice content by default.
- [ ] Only after kitchen is stable, extract reusable concepts: `Device`, `Profile`, `View`, `Surface`, semantic `Action`, and per-device context/view-selection rules.
- [ ] Keep device identity authenticated and authorized; the `/app?device=...` query string may select a profile but is not authorization.

- [ ] **Acceptance:** Reliable kitchen behavior across restart/reconnect; documented setup and troubleshooting; clean boundaries for a second device profile without building a premature plugin system.

## Interfaces and state contracts to define

Start with these **proposed**, versioned API contracts. The exact HTTP/WebSocket paths are negotiable; the semantics are not.

```text
GET  /api/devices/{deviceId}/profile
GET  /api/devices/{deviceId}/state
GET  /api/devices/{deviceId}/context
POST /api/devices/{deviceId}/commands
WS   /ws/devices/{deviceId}
```

- **Commands:** Typed and validated (e.g. `{type:"recipe.open",recipeId:"..."}`); idempotency keys for operations where retries matter.
- **State:** Per-device session, plus current logical view, but **not** duplicated playback or timer engine state.
- **Events:** Include device ID, event type, revision/timestamp; reconcile by fresh state after reconnect.
- **Context:** Supply the current *displayed* recipe and servings, not whichever recipe Hermes last discussed.
- **Authentication:** Enforce server-side per-device access and separate Hermes tool permissions. Never trust user-provided device IDs or unbounded command parameters.
- **Persistence:** Keep the cooking session; do not unnecessarily persist temporary scroll animation or active timer countdowns.

## Recommended first PR / agent work order

1. **PR 1 — Scaffold + prototype port:** Add reproducible web build, Docker development setup, component shell, fixture data and visual references; verify custom-page viewport/bridge access on the Portal and document configuration and findings.
2. **PR 2 — Timers/media:** Verify native timer capabilities while implementing the adapter and pill UI; integrate Sonos mini-player/ambient clock and test real playback. No full-screen music view.
3. **PR 3 — Mealie + persistence:** Implement Mealie access and normalization against actual recipes, recipe picker, real cooking session and restore.
4. **PR 4 — Hermes tools:** Implement context endpoint, semantic commands and device mapping; verify through real voice actions, and investigate optional prompt injection during voice QA.
5. **PR 5 — Web discovery:** Search/selection/import workflow with provenance and confirmation.
6. **PR 6 — Polish/hardening:** Reliability, photos, UI iteration and framework extraction as justified.

PRs should remain independently testable. Include relevant integration findings in `docs/integrations.md` with each PR, rather than creating a separate integration-proofs PR. Do not hide infrastructure decisions or unresolved integration failures behind UI mocks.

## Key known risks and decision gates

| Question / risk | Gate / fallback |
|---|---|
| Does custom-page JS access native timer APIs on this exact Portal build? | Phase 2 timer integration; if unavailable, investigate supported HA timer state/event integration before designing a replacement. |
| Can the normal wake-word voice path inject an extra system prompt into Hermes? | Phase 4 optional context-injection check; if not, use `recipe_get_context()` tools. |
| Can Hermes identify voice originating from this specific satellite? | Phase 4 tool implementation and voice QA; v1 may use fixed kitchen-target mapping while single-device, with explicit limits. |
| Does Kiosk Satellite expose its HA connection to custom pages safely? | Phase 1 custom-page setup; otherwise use a dedicated authenticated backend channel. |
| Is Mealie parsing/scaling consistent across actual recipes? | Phase 3 Mealie implementation and real-recipe fixtures; preserve textual quantities where scaling is ambiguous. |
| Can overlays and timer notifications coexist with recipe scrolling? | Real-device QA; add dynamic bottom scroll clearance, not permanent wasted footer space. |
| Does the system recover when the Portal or app reloads? | Phase 3/6; durable session state and adapter rehydration. |
| Is the backend a needless abstraction? | Begin with a minimal controller that solves Hermes-to-page actions and persistence; keep it small. |

## Definition of done for the initial kitchen MVP

- [ ] Portal reliably displays the production web app at a verified viewport.
- [ ] Ambient photo/clock view and recipe view match intended design.
- [ ] User can open a real Mealie recipe and work through ingredients and instructions.
- [ ] Current cooking session survives page reload.
- [ ] Voice-created named timers appear in custom UI, count down accurately and alert on completion.
- [ ] Music shows a compact Sonos indicator only when playing; recipe stays visible while cooking.
- [ ] Hermes can answer questions about the *currently displayed* recipe.
- [ ] Hermes can update recipe step and servings via validated tools.
- [ ] Existing Whisper/Piper/Hermes/Assist voice flow keeps working.
- [ ] No full-screen Now Playing feature is implemented as part of MVP.

## Instructions for future agents

1. **Read `concept.md` and this plan first; inspect the actual code and deployment before changes.** The concept contains important visual and product constraints, but is exploratory.
2. **Ask only where a choice blocks safe implementation.** Otherwise proceed in small verifiable increments and document assumptions.
3. **Do not overwrite proven existing voice, timer, or Sonos configuration.** Test integrations with a separate prototype path before changing operational behavior.
4. **Preserve the user's UI control.** Do not swap the design for generic Lovelace cards or default widgets unless requested.
5. **Use real device tests.** Desktop preview is not sufficient for WebView API, viewport and timer behavior.
6. **Keep native services authoritative** and use semantic tool commands, not arbitrary execution or simulated state as production data.
7. **Document verification and failures** in `docs/integrations.md`; clearly distinguish confirmed APIs from proposed interfaces.
8. **Do not build full-screen Now Playing now.** Keep music to a compact conditional mini-player and defer all automatic music-screen transitions.
9. **Treat credentials and local network endpoints carefully.** Secrets remain server-side; never commit Mealie tokens or HA credentials.
10. **Update this plan** after each work session: maintain task/acceptance checkboxes and the completion log above, and record significant discoveries or scope changes.
