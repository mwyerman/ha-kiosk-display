# HA Kiosk Display — Concept Notes

> **Status: exploratory concept, not an implementation specification.** These are working ideas from a design discussion. Nothing here is a fixed requirement; hardware behavior, integrations, and implementation details should be validated in practice.

## The idea

**HA Kiosk Display is envisioned as a small, reusable framework for context-aware, voice-friendly screens.** The kitchen is the **first use case and reference implementation**, not the entire product. Future device profiles might cover bedroom, office, or other room-specific experiences. A single centrally hosted SPA can serve many devices with different experiences and independent state.

The first implementation aims to turn a rooted **Meta/Facebook Portal 10 (2nd generation)** running **Kiosk Satellite** into a polished, voice-first kitchen display, integrated with **Home Assistant Assist** and a **Hermes-based LLM**. It should feel like a dedicated kitchen appliance—not a Lovelace dashboard or a generic tablet interface.

The Portal sits in **landscape**, viewed often from **several feet away**. Initial design target: **1280 × 800, 16:10**, with actual WebView viewport sizing to be verified on-device. A **custom, locally hosted web app** is favored over Lovelace or a separate Android APK. Docker web hosting is already available.

## Framework concepts (exploratory)

- **Profile:** Reusable configuration describing a device's available views, surfaces, appearance, integrations, and view-selection rules. For example, `kitchen`, `bedroom`, or `office`.
- **Device:** A particular physical client (e.g. `kitchen-portal`) assigned a profile. Several devices may use the same profile without sharing their current activity. Prefer the term **device**, not "display", for this identity.
- **Central state:** Durable or meaningful per-device state (active recipe, selected view override, cooking session, etc.) managed by a shared server and synchronized with clients. Reconnects and browser reloads should restore it. External state such as media playback can remain authoritative in Home Assistant; ephemeral animations and ordinary scroll gestures can remain browser-local.
- **Views:** Full-screen experiences, e.g. photo frame, recipe book, music, calendar, bedside clock.
- **Surfaces:** Independent UI elements layered over a view—timer pills, music mini-player, notifications, voice feedback, transient launcher. The framework could manage placement, visibility, and overlay-aware scroll clearance.
- **Rules / view resolver:** Determine the primary view from context and priorities, potentially with temporary manual selection and configurable return behavior. No required permanent tabs.
- **Actions and context:** Small validated semantic commands and readable per-device context exposed to Hermes, Home Assistant automations, and touch interactions.

For example, a single SPA served at `/app?device=kitchen-portal` could ask the server for its assigned profile and current state, then subscribe for updates. `bedside-panel` could load the same SPA but use another profile. A URL device parameter is a routing hint, **not proof of device identity**; the backend should authenticate and authorize the caller. Profiles should generally live centrally (e.g. YAML or database configuration), rather than passing an entire untrusted configuration in the URL.

The server is a candidate for owning cross-client state and command routing. This should not mean copying every Home Assistant entity into its own database.

### Kitchen: first use case

## Experience and display states

No permanent tab/navigation bar. The primary view should be derived from actual activity:

1. **Cooking session / recipe active** → recipe display.
2. **Otherwise, kitchen speaker playing music** → music display.
3. **Otherwise** → ambient/photo-frame home display.

This ordering is an initial idea, not a rigid policy. Timers are **independent** of cooking and music. A finished timer may surface a notification without replacing the main view.

### Ambient / home

- A beautiful, quiet **digital photo frame**, eventually displaying personal photos from a locally hosted library or folder.
- Optional large clock and date, legible from across the kitchen.
- No “Kitchen ready,” “A moment at home,” gratuitous logo, connection badge, or top navigation/status chrome.
- No empty timer bar; display timer pills **only when timers are active**.

### Recipe / cooking

- **Prominent recipe photograph**, ingredient list, and **multiple recipe steps visible together**.
- More like a lovely digital recipe book than a linear step-by-step wizard: people skip around and do not always follow instructions sequentially.
- Ingredients and instructions ideally scroll independently, with optional ingredient checkboxes, servings adjustment, and step highlighting.
- One normal/comfortable-density layout; the alternate “roomier/focus” layout was intentionally dropped.
- Large enough typography and touch targets for a 10-inch landscape screen viewed from a few feet away.
- Remove the cooking-screen clock and unnecessary top bar so recipe content has room.
- When music is playing, a compact speaker indicator/control may appear. When it is not playing, **do not show** the kitchen speaker widget.

### Music

- A polished, album-art-led now-playing screen when music is the main active state.
- Use the nearby kitchen speaker's Home Assistant `media_player` state and metadata when available.
- Music continues independently during cooking; it should not displace an active recipe.
- Music metadata/control UI on the recipe screen should appear only when applicable.

### Timers

- **Voice-first creation and management**; no permanent “+” control is needed on the display.
- Support **multiple named, simultaneous timers**, including when no recipe is open.
- Show small **floating timer pills only while timers are active** (or finished and awaiting dismissal).
- Pills should overlay rather than consume a permanent footer, but **must not make recipe content inaccessible**: scrollable ingredients/instructions can dynamically gain sufficient extra scroll range while pills overlap them, then lose that clearance when the pills disappear.
- Explore whether to use Kiosk Satellite's native timer capabilities/events, render custom pills from those events, or integrate another Home Assistant timer source. Avoid duplicate sets of timer overlays.
- Completion/alerts should be noticeable without throwing the user out of the current view.

## Voice-driven interactions

Representative requests:

- “Pull up the chicken parmesan recipe.”
- “How much cream do I need?”
- “When do I add the basil?”
- “Show me where it says to add the basil.”
- “Make it for six people.”
- “Start an eight-minute pasta timer.”
- “How much time is left on the pasta timer?”
- “Finish cooking.”

The important goal is **contextual awareness**: Hermes should know which recipe is currently displayed and answer questions about it without relying only on conversation history. Reading a recipe question need not alter the display; an explicit “show me” request may scroll to/highlight the relevant instruction.

## Tentative technical direction

A possible separation of concerns:

- **Kiosk Satellite on the Portal:** voice-satellite endpoint, WebView hosting the custom page, device display behaviors, potentially timer events.
- **Home Assistant:** Assist/satellite plumbing, speaker state and controls, voice/timer integrations as appropriate.
- **Hermes agent:** understands speech, invokes a small allowlisted set of semantic tools; does **not** remotely click arbitrary screen coordinates or execute arbitrary browser JavaScript.
- **Docker-hosted web app:** polished UI, subscribes to state changes and renders the appropriate screen; touch actions can update shared state.
- **Possible shared framework server:** small REST/WebSocket service that loads device profiles, owns centrally managed per-device state, routes validated actions, retrieves context, and broadcasts updates. A kitchen recipe module can integrate Mealie.
- **Mealie (candidate):** local recipe database and structured recipe source; its integration/API could support search, ingredients, instructions, photos, and offline/LAN-only operation.

A small state model might track the logical screen, whether cooking is active, current recipe ID, servings, highlighted instruction, and checked ingredients. Avoid stuffing entire recipes and all transient metadata into a single HA helper. A separate controller with SQLite or similar durable storage is a possibility, **not a committed design**.

Possible tools for Hermes:

- `kitchen_search_recipes`
- `kitchen_show_recipe`
- `kitchen_get_context`
- `kitchen_navigate_recipe`
- `kitchen_set_servings`
- `kitchen_finish_cooking`

The **recipe currently open** should be fetched from shared session state when answering questions. A tool can provide structured recipe content and selected servings. Touch changes and voice-driven changes should converge on the same state, surviving reloads/reconnections.

## Device awareness / multi-device support

Home Assistant's Assist/LLM integrations may supply an originating device ID, but **verify whether the current Hermes integration actually preserves that identity** before depending on it.

Distinguish:
1. **Voice origin**: which satellite heard the command.
2. **Target device**: which physical client should change.
3. **Cooking session**: what recipe/state that screen currently has.

A backend could map authenticated HA device identifiers to logical framework device IDs. A request heard at the kitchen Portal would ordinarily target that Portal; a request heard on another satellite might require a configured target or an explicit phrase like “on the kitchen display.” The model should not be trusted to invent or assert privileged device IDs.

## Communication idea

A prototype could use a LAN-only HTTPS/HTTP site hosted in Docker and a lightweight API/WebSocket controller:

```text
GET  /api/devices/{device_id}/profile
GET  /api/devices/{device_id}/state
GET  /api/devices/{device_id}/context
POST /api/devices/{device_id}/commands
WS   /ws/devices/{device_id}
```

Each SPA client subscribes for real-time state changes, while Hermes issues validated semantic commands to the backend. An alternate lean first iteration could use HA state/helpers and the Kiosk Satellite Custom Pages bridge, then introduce a dedicated controller as needed.

Authentication and authorization matter even on a LAN: keep Mealie credentials server-side, validate the originating client and permitted display mappings, and never expose unrestricted URLs, code execution, or general-purpose HTTP tools to the LLM.

## Manual navigation and extensibility

Context-driven view selection is the default, but future office or bedroom views may need manual entry. A transient on-demand launcher or voice command could request a view without adding permanent tabs. Whether a manual selection expires, stays until dismissed, or yields to a higher-priority event is intentionally an open design question.

A kitchen recipe view and bedroom clock should be able to use the same runtime without importing room-specific logic into the framework. Start with practical shared primitives from the kitchen implementation; do **not** build an elaborate plugin system in advance.

## What remains open

- How device provisioning, authentication, profile assignment, and centrally managed state persistence should work.
- How temporary manual view overrides and return policies should behave.
- The exact interface and device-context propagation of the existing Hermes conversation-agent integration.
- Kiosk Satellite Custom Pages behavior on this rooted Portal build, including bridge and voice-timer capabilities.
- Which system should own timers and whether its state can be shared cleanly with the custom UI.
- Mealie as the final recipe source versus alternatives.
- Hosting and frontend framework choice (Svelte/TypeScript, plain web app, etc.).
- How personal photos are served, cached, and rotated locally.
- Idle transitions, wake behavior, screen burn-in/brightness, and timer alerts on the actual hardware.

## Sensible first milestone

Run the latest interactive visual concept on the real Portal in its WebView and verify its usable screen dimensions and performance. Separately prove a small end-to-end flow: **voice command on the Portal → verified originating device → update a per-device state → live dashboard changes → contextual question reads that session's current recipe**.

Only after that proof of concept should the architecture be hardened.

---

*These notes document an evolving concept and design preferences, not a normative specification or implementation contract.*
