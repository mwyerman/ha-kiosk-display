# Luna recipe voice control — development

## Production promotion

The same plugin/backend support production without a different toolset. Set
`KIOSK_VOICE_KEY` in the production stack's private `.env` and explicitly pass it
through Compose, preserving the persistent cooking volume. Configure Luna's
`plugins.entries.hermes-kiosk-recipes.settings.base_url` to
`http://192.168.1.2:8090`, update its SOUL's dev-only scope statement, then hot-load
the plugin. Keep only one active target; this is not room routing. Retain the
previous image digest, Compose/env backups and a SQLite backup before recreating
the display service. No HA/Hermes restart or satellite configuration change is
needed. The production page remains the existing port-8090 address.

The live test can target production using
`KIOSK_TEST_BASE_URL=http://192.168.1.2:8090`; `--yes` authorizes the same temporary
recipe open/navigation/touch-switch/close operations. Check for an active cooking
session before running it. The sections below preserve the original dev setup.

## Scope

The existing Kiosk Satellite → HA Assist → Hermes Conversation → Luna voice route
is unchanged. Luna's recipe plugin targets **only the development backend** at
`http://127.0.0.1:5176`; the screen is `https://kiosk-dev.eos.mxwy.org/`.
There is one shared kitchen session, no origin-to-display routing. A request on any
satellite using Luna can change that shared dev session. Production was not deployed.

Supports Mealie search/open, questions grounded in the active cooking snapshot,
exact numbered-step jumps, next/previous and finish. No web discovery/import,
scaling, timer/music control or ingredient checkboxes.

## Implementation and ownership

- `server/app.mjs`: `POST /api/voice`, fixed actions and a dedicated bearer key;
  `GET /api/session/events`, browser-authenticated SSE revision notifications.
- `server/index.mjs`: reads `KIOSK_VOICE_KEY` from process environment. Without it,
  the voice endpoint is disabled. No database migration or new Node dependencies.
- `src/App.svelte`: subscribe after session restore/pairing; refresh after updates,
  reconnect and resume; defer notifications during touch mutations; dismiss the
  picker when a recipe is opened externally. The app does not reload the page.
- `src/components/RecipeView.svelte`: scroll selected instructions into view.
- `integrations/hermes-kiosk-recipes/`: versioned native Hermes plugin, installed
  as a Luna-only symlink at `/opt/data/profiles/luna/plugins/hermes-kiosk-recipes`.
  Four tools: `kiosk_find_recipe`, `kiosk_current_recipe`,
  `kiosk_recipe_control`, `kiosk_go_to_step`.

The plugin reads the URL from
`plugins.entries.hermes-kiosk-recipes.settings.base_url` in the active profile's
config, and the dedicated key via Hermes's profile-scoped `get_secret`.
The key is in Luna's `.env` as `KIOSK_VOICE_KEY` and is also supplied to the dev
backend. It is not the Mealie token or browser pairing key; it never enters Vite
variables, browser code or committed files. Redirects are rejected by the plugin.

Search favors a unique exact title or unique title phrase only when the result
set is complete; otherwise it asks for a choice. Mealie searches can include
incidental description/ingredient matches. Opening checks the session revision
captured before the upstream search. Navigation tools read fresh state internally
and submit its revision once; a conflict is never auto-retried. Browser touch
writes use the same serialized mutation path. Neither channel writes Mealie.

### Keeping Luna grounded

Luna's local model needed simpler tool interfaces in real testing:

- `tools.tool_search.enabled=off` in **Luna only** exposes these few schemas directly;
  deferred lexical tool discovery consumed the three-turn budget and misled the model.
- A dedicated numbered-step tool avoids the model emulating step jumps with repeated
  `next` calls. Navigation handles revision bookkeeping outside the LLM.
- `pre_llm_call` reads small live metadata once at the start of each API user turn:
  recipe ID/title, revision, selected-step number. Hermes appends it to the **new
  user message**, not the system prompt or past history, preserving prompt caching.
  Raw ingredients/instructions are only fetched when needed via the context tool.
  This prevents a touch-opened recipe being confused with an earlier conversation.
- Exact next/previous utterances receive a small action-vs-peek hint in the same
  new-turn context. The hook performs no writes; all changes still go through
  the registered tools. Free-form local-model interpretation is not deterministic.
- Open/control return compact confirmations rather than embedding the full recipe
  into every action result. `kiosk_current_recipe` exposes original ingredients,
  explicitly numbered instructions, selected step and next step.
- Source text is data, not agent instructions; substitution advice must be labeled.
  "What comes next?" reads without changing selection; "next step" advances.

Luna's API toolset is `kiosk_recipes` only; no shell/browser/web/HA permissions were
added to that surface. Luna's `SOUL.md` includes recipe behavior. The previous
config and SOUL are in its `backups/kiosk-recipes-*` directory. The plugin was
hot-loaded through Hermes's supported gateway control socket, without restarting
Hermes or HA. Existing voice sessions may need "start over" after schema changes.

## Running and verifying development

Follow `local-kiosk-development.md` for the existing API/Vite processes. Also
supply the same `KIOSK_VOICE_KEY` to Node as is configured for Luna. Do not print
secrets or put them in command-line arguments. Leave both servers running for
Portal acceptance; they do not survive a container restart automatically.

```sh
export PATH=/opt/data/tools/node/bin:$PATH
npm run test:server
python3 -m unittest discover -s integrations/hermes-kiosk-recipes -v
npm run check
npm run build
LD_LIBRARY_PATH=/opt/data/tools/chromium-libs npm test -- --config playwright.local.config.ts
```

`server/voice.test.mjs` covers the service-auth boundary, search choice,
revision-checked navigation, stale search races and SSE. `tests/voice.spec.ts`
checks external screen open, picker closure, step scrolling and finish without
navigation/reload. Plugin tests cover transport, redirect refusal, compact state,
live metadata and no conflict retry.

`scripts/test-voice-live.py --yes` is an explicitly mutating live acceptance test.
Use `/opt/data/tools/qa-venv/bin/python`, with `PLAYWRIGHT_BROWSERS_PATH` set to
`/opt/data/tools/pw-browsers`; provide `KIOSK_TEST_HA_URL` and
`KIOSK_TEST_HA_TOKEN` through environment, obtained using the existing HA connector.
It sends text through the **real HA conversation service**, not a simulated Luna,
and observes the actual HTTPS dev page with Chromium. It opens enchiladas, asks
an ingredient question, jumps/advances/goes back, verifies peek does not advance,
touch-opens White Chicken Chili on a second browser, checks Luna notices, and
closes the dev session. It never imports, edits or deletes a Mealie recipe.

This proves HA→Luna→backend→browser behavior, **not** the satellite microphone,
wake word, STT, spoken TTS, native audio or physical Portal rendering. Those remain
user acceptance checks. Do not reload/HMR during a ringing timer to test dismissal.

## Try on the Portal

Set the Custom Page URL to `https://kiosk-dev.eos.mxwy.org/` if it isn't already.
Keep the existing Luna Assist pipeline. Say "start over" once before testing.

- "Open the chicken enchiladas recipe."
- "What is the first ingredient?" / "How much chicken does this use?"
- "Go to step three." (exact jump + visible highlight/scroll)
- "What comes next?" (read only; highlight stays put)
- "Next step." / "Previous step." / "Read this step again."
- Open another recipe by touch, then ask "What recipe is on screen now?"
- "Could I substitute something for the cream?" (advice, no recipe edits)
- "Open a chicken recipe." (may ask which match)
- "Open a recipe for something not in Mealie." (no invented result/web fallback)
- "Close the recipe." (ambient screen; native timers/music stay independent)

## Rollback / production boundary

To disable this experiment, remove `kiosk_recipes` from Luna's API toolsets using
`hermes -p luna config set`, disable its plugin, and restore its previous SOUL if
wanted. Remove `KIOSK_VOICE_KEY` from the dev backend environment and restart only
that backend to disable `/api/voice`. Preserve SQLite; do not delete the cooking
volume. Profile backups are reference/recovery files, not automatic live restores.

Do not point the plugin at production or publish/deploy an image without separate
approval. No commits, branch pushes, production Compose or satellite configuration
changes are part of this dev deployment.
