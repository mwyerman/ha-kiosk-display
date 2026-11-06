# HA Kiosk Display — Concept Notes

> **Status: exploratory concept, not an implementation specification.** These are working ideas from a design discussion. Nothing here is a fixed requirement; hardware behavior, integrations, and implementation details should be validated in practice.

## The idea

Turn a rooted **Meta/Facebook Portal 10 (2nd generation)** running **Kiosk Satellite** into a polished, voice-first kitchen display, integrated with **Home Assistant Assist** and a **Hermes-based LLM**. It should feel like a dedicated kitchen appliance—not a Lovelace dashboard or a generic tablet interface.

The Portal sits in **landscape**, viewed often from **several feet away**. Initial design target: **1280 × 800, 16:10**, with actual WebView viewport sizing to be verified on-device. A **custom, locally hosted web app** is favored over Lovelace or a separate Android APK. Docker web hosting is already available.

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
- **Optional Docker-hosted kitchen controller:** small REST/WebSocket service that owns per-display sessions, fetches recipes, validates commands, and broadcasts updates.
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

## Device awareness / future multi-screen support

Home Assistant's Assist/LLM integrations may supply an originating device ID, but **verify whether the current Hermes integration actually preserves that identity** before depending on it.

Distinguish:
1. **Voice origin**: which satellite heard the command.
2. **Display target**: which screen should change.
3. **Cooking session**: what recipe/state that screen currently has.

A backend could map authenticated HA device identifiers to logical display IDs. A request heard at the kitchen Portal would ordinarily target that Portal; a request heard on another satellite might require a configured target or an explicit phrase like “on the kitchen display.” The model should not be trusted to invent or assert privileged device IDs.

## Communication idea

A prototype could use a LAN-only HTTPS/HTTP site hosted in Docker and a lightweight API/WebSocket controller:

```text
GET  /api/screens/{screen_id}/state
GET  /api/screens/{screen_id}/context
POST /api/screens/{screen_id}/commands
WS   /ws/screens/{screen_id}
```

The dashboard subscribes for real-time session changes, while Hermes issues validated semantic commands to the backend. An alternate lean first iteration could use HA state/helpers and the Kiosk Satellite Custom Pages bridge, then introduce a dedicated controller as needed.

Authentication and authorization matter even on a LAN: keep Mealie credentials server-side, validate the originating client and permitted display mappings, and never expose unrestricted URLs, code execution, or general-purpose HTTP tools to the LLM.

## What remains open

- The exact interface and device-context propagation of the existing Hermes conversation-agent integration.
- Kiosk Satellite Custom Pages behavior on this rooted Portal build, including bridge and voice-timer capabilities.
- Which system should own timers and whether its state can be shared cleanly with the custom UI.
- Mealie as the final recipe source versus alternatives.
- Hosting and frontend framework choice (Svelte/TypeScript, plain web app, etc.).
- How personal photos are served, cached, and rotated locally.
- Idle transitions, wake behavior, screen burn-in/brightness, and timer alerts on the actual hardware.

## Sensible first milestone

Run the latest interactive visual concept on the real Portal in its WebView and verify its usable screen dimensions and performance. Separately prove a small end-to-end flow: **voice command on the Portal → verified originating device → update a per-screen session → live dashboard changes → contextual question reads that session's current recipe**.

Only after that proof of concept should the architecture be hardened.

---

*These notes document an evolving concept and design preferences, not a normative specification or implementation contract.*
