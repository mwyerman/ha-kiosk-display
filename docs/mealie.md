# Mealie recipes and cooking sessions

## Scope and screen

Touch-first recipe browse/search, original ingredient wording, sectioned
instructions, optional step highlighting and persistent single-kitchen session.
The accepted cooking layout has a faint recipe-photo background, 30%-opaque
reading surfaces, one titlebar and compact inline step headings. The picker is a
full-screen thumbnail grid and focuses its heading, not the search input, to avoid
opening the touch keyboard. Ingredients are plain text: no checkboxes or tap
mutations. No scaling, serving adjustments or additional metadata blocks take up
cooking-screen space. Native timers/music remain independent. Development voice
control through Luna is documented in `voice-recipes.md`; imports, meal planning
and general multi-device routing remain out of scope.

## Deployment

One production container serves built Svelte assets and the Node HTTP API on
8080. SQLite is `/data/kiosk.sqlite` in the persistent `cooking-data` volume.
The runtime runs as the unprivileged Node user. Node 24+ is required; Docker uses
Node 24 and runs backend tests during image build. Fixture images remain static
nginx previews and never contact Mealie. There are no new runtime npm packages.

Deployment requires approval. Keep the previous image digest and recoverable
Compose definition before an update. Back up SQLite before later migrations;
never run `docker compose down -v` as routine update/rollback. The first backend
deployment creates the volume; the older static image has no cooking database.

## Configuration and access

The checkout-managed Compose file explicitly passes configuration into the
container. A host `.env` file alone does not inject variables into a container.

```dotenv
MEALIE_URL=https://mealie.helios.mxwy.org
MEALIE_API_KEY=<existing dedicated Mealie token>
KIOSK_REQUIRE_PAIRING=false
COOKIE_SECURE=false
ALLOWED_ORIGINS=
```

**No second key is required.** The supplied Compose definitions explicitly choose
trusted-LAN, unpaired access. Anyone able to reach this app can read recipes and
change the shared kitchen session. Do not expose it directly to the internet.
The Mealie token remains server-side and must never be a `VITE_*` variable,
committed value, browser-stored credential or served configuration file.

Mutation origins are checked against the request host and expected scheme. When
using an HTTPS reverse proxy with `COOKIE_SECURE=false`, supply its exact origin
in `ALLOWED_ORIGINS` (comma-separated for multiple approved origins); forwarded
scheme headers are not trusted automatically. For the direct HTTP LAN URL no
extra allowed origin is needed. Cross-site Fetch Metadata is rejected too.

The optional pairing implementation remains available only if deliberately enabled
with `KIOSK_REQUIRE_PAIRING=true` and a separate `KIOSK_ACCESS_KEY`. The bare CLI
fails closed without a key unless unpaired mode was explicitly selected. This is
not required by the accepted local deployment.

Upstream paths and recipe IDs are allowlisted; requests and image sizes are bounded.
Failures are sanitized. Never log tokens, cookies, full environment files or private
recipe payloads.

## Local development

Ordinary `npm run dev` is backend-free static fixture preview. `npm run preview`
serves static assets only; use the Node server to test production APIs.

For the live development URL, keep **both** processes running:

1. Start Node 24 `server/index.mjs` with the approved key in process environment,
   `KIOSK_REQUIRE_PAIRING=false`, `HOST=127.0.0.1`, `PORT=5176`, the exact HTTPS
   dev origin in `ALLOWED_ORIGINS`, and persistent `SESSION_DB=./data/kiosk.sqlite`.
2. Run `npm run dev:kiosk`; Vite forwards `/api` to the loopback backend.
3. Verify the actual HTTPS URL's health/session/search endpoints and recipe picker,
   not just the frontend page. Full procedure: `local-kiosk-development.md`.

Background dev processes survive turns, not container restarts. Check for existing
Vite processes before editing: HMR immediately exposes edits on the Portal. Avoid
reloads/HMR while native timers are ringing; reload can stop native alert audio.

## State and recovery

Mealie remains the source. Opening a recipe stores a bounded normalized snapshot
in SQLite. Reload/backend restart can restore it without Mealie availability.
Search/new opens require Mealie. Upstream edits/deletion do not silently replace
an active cook; finish/reopen to load fresh content. Missing photos fall back to
the neutral reading background; recipe text remains usable.

Session writes use revision checks. Conflict refreshes state and asks for another
tap rather than overwriting changes. Multiple browsers intentionally share one
kitchen session. The development voice integration adds SSE revision notifications
for external updates; it is not a general multi-device routing system. Scroll is
transient, selected step is durable. Legacy checked-item fields are ignored by
the UI and retained for compatibility, not exposed as a checklist.

## Real-recipe verification

The verified Mealie v3.16.0 collection contained 25 recipes. Representative checks:
Halal Style Chicken Platter (sections, 32 ingredients/11 steps), The Best Creamy
Chicken Enchiladas (unparsed text/long instructions), Soy Marinaded Wings (missing
photo/servings), and Green Curry Chicken (Unicode fractions/multilingual title).
Many imported records have numeric quantity zero but actual amounts in display/note.
Preserve `display`, then original text/note; never replace those amounts with zero.
Incomplete imported content is not an invitation to generate missing ingredients.

```sh
npm run test:server
npm run check
npm run build
npm test
```

The local Chromium override is in `local-kiosk-development.md`. To test actual
Mealie without modifying production sessions, run `npm run test:mealie-live` with
the key in environment; `LIVE_BROWSER=true` also runs the built UI with an ephemeral
SQLite database. Browser route tests and native bridge mocks do not prove physical
Portal behavior. Keep actual acceptance/deployment results in `integrations.md`.
