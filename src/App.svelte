<script lang="ts">
  import { onMount } from 'svelte';
  import AmbientView from './components/AmbientView.svelte';
  import RecipeView from './components/RecipeView.svelte';
  import TimerPills from './components/TimerPills.svelte';
  import MusicPill from './components/MusicPill.svelte';
  import Modal from './components/Modal.svelte';
  import VoiceStatus from './components/VoiceStatus.svelte';
  import Diagnostics from './components/Diagnostics.svelte';
  import RecipePicker from './components/RecipePicker.svelte';
  import {
    disconnectedAdapter,
    type DisplayAdapter,
    type RecipeSession,
  } from './lib/model';
  let session = $state<RecipeSession>({
    revision: 0,
    recipe: null,
    checked: [],
    selected: null,
  });
  let sessionBusy = $state(false);
  let sessionError = $state('');
  let sessionSequence = 0;
  let disposed = false;
  let sessionLoading = $state(false);
  let needsPairing = $state(false);
  let pairingKey = $state('');
  let pairingBusy = $state(false);
  let pairingError = $state('');
  let sessionEvents: EventSource | undefined;
  let pendingSessionRefresh = false;
  function startSessionEvents() {
    if (fixtureMode || disposed || sessionEvents) return;
    sessionEvents = new EventSource('/api/session/events');
    sessionEvents.addEventListener('open', () => void loadSession());
    sessionEvents.addEventListener('message', (event) => {
      try {
        const update = JSON.parse((event as MessageEvent).data);
        if (
          Number.isSafeInteger(update.revision) &&
          update.revision !== session.revision
        )
          void loadSession();
      } catch {
        /* Ignore malformed notifications; reconnect and resume refresh authoritative state. */
      }
    });
  }
  function drainSessionRefresh() {
    if (!pendingSessionRefresh || disposed) return;
    pendingSessionRefresh = false;
    void loadSession();
  }
  async function loadSession(force = false, keepError = false) {
    if (sessionBusy && !force) {
      pendingSessionRefresh = true;
      return;
    }
    const request = ++sessionSequence;
    sessionLoading = true;
    try {
      const response = await fetch('/api/session', {
        credentials: 'same-origin',
      });
      if (request !== sessionSequence || disposed) return;
      if (response.status === 401) {
        needsPairing = true;
        sessionError = 'Pair this kitchen to access recipes.';
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!disposed && request === sessionSequence) {
        if (
          result.recipe &&
          result.revision !== session.revision &&
          modal === 'recipes'
        )
          modal = '';
        session = result;
        cooking = !!session.recipe;
        needsPairing = false;
        startSessionEvents();
        if (!keepError) sessionError = '';
      }
    } catch {
      if (!disposed && request === sessionSequence)
        sessionError = keepError
          ? 'The cooking session changed. Refresh failed; please retry before making changes.'
          : 'Unable to restore the cooking session. Please retry.';
    } finally {
      if (request === sessionSequence) {
        sessionLoading = false;
        if (!sessionBusy) drainSessionRefresh();
      }
    }
  }
  async function pair() {
    if (pairingBusy || !pairingKey.trim()) return;
    pairingBusy = true;
    pairingError = '';
    const key = pairingKey;
    pairingKey = '';
    try {
      const response = await fetch('/api/pair', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!response.ok) throw new Error();
      await loadSession();
      if (needsPairing)
        pairingError = 'Pairing could not be confirmed. Please try again.';
    } catch {
      pairingError =
        'Unable to pair this kitchen. Check the pairing key and try again.';
    } finally {
      pairingBusy = false;
    }
  }
  type Action =
    | { type: 'open'; recipeId: string }
    | { type: 'check'; ingredientId: string; checked: boolean }
    | { type: 'select'; stepId: string | null }
    | { type: 'finish' };
  async function mutate(action: Action) {
    if (sessionBusy || sessionLoading || needsPairing) return;
    if (fixtureMode) {
      if (action.type === 'open') {
        session = { ...session, checked: [], selected: null };
        cooking = true;
        modal = '';
      }
      if (action.type === 'check')
        session.checked = action.checked
          ? [...session.checked, action.ingredientId]
          : session.checked.filter((id) => id !== action.ingredientId);
      if (action.type === 'select') session.selected = action.stepId;
      if (action.type === 'finish') {
        cooking = false;
        session = { ...session, checked: [], selected: null };
      }
      return;
    }
    sessionBusy = true;
    sessionError = '';
    const request = ++sessionSequence;
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...action, revision: session.revision }),
      });
      if (response.status === 401) {
        needsPairing = true;
        sessionError = 'Pair this kitchen to access recipes.';
        return;
      }
      if (response.status === 409) {
        sessionError =
          'The cooking session changed on another device. Review the refreshed session and try again.';
        await loadSession(true, true);
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!disposed && request === sessionSequence) {
        session = result;
        cooking = !!session.recipe;
        if (action.type === 'open') modal = '';
      }
    } catch {
      if (!disposed && request === sessionSequence)
        sessionError =
          'Unable to update the cooking session. Your displayed state is unchanged. Please retry.';
    } finally {
      sessionBusy = false;
      drainSessionRefresh();
    }
  }
  import {
    connectKiosk,
    initialStatus,
    type IntegrationStatus,
    type TimerAction,
  } from './lib/kiosk';

  const fixtureMode =
    import.meta.env.MODE === 'fixture' ||
    (import.meta.env.DEV && import.meta.env.MODE !== 'kiosk');
  let adapter = $state<DisplayAdapter>(disconnectedAdapter);
  const activeRecipe = $derived(fixtureMode ? adapter.recipe : session.recipe);
  let integration = $state<IntegrationStatus>({ ...initialStatus });
  let connection = $state<ReturnType<typeof connectKiosk>>();
  let busy = $state(false);
  async function controlTimer(id: string, action: TimerAction) {
    if (busy || !connection) return;
    busy = true;
    const success = await connection.control(id, action);
    busy = false;
    notify(success ? 'Timer updated' : 'Timer action failed or unsupported');
  }
  let cooking = $state(false);
  let showTimers = $state(false);
  let showMusic = $state(false);
  const hasSurfaces = $derived(
    Boolean(
      ((!fixtureMode || showTimers) && adapter.timers.length) ||
      ((!fixtureMode || showMusic) && adapter.music),
    ),
  );
  let modal = $state('');
  let message = $state('');
  let surface: HTMLDivElement | undefined = $state();
  let clearance = $state(0);
  let notification: ReturnType<typeof setTimeout>;
  const diagnostics = new URLSearchParams(location.search).has('diagnostics');
  function notify(text: string) {
    message = text;
    clearTimeout(notification);
    notification = setTimeout(() => (message = ''), 2600);
  }
  function openRecipe() {
    if (adapter.recipe)
      void mutate({ type: 'open', recipeId: adapter.recipe.id });
  }
  onMount(() => {
    if (!fixtureMode) void loadSession();
    if (fixtureMode)
      void import('./lib/fixtures').then(
        ({ fixtureAdapter }) => (adapter = fixtureAdapter),
      );
    if (!fixtureMode)
      connection = connectKiosk((timers, music, status) => {
        adapter = { ...adapter, timers, music };
        integration = status;
      });
    const resume = () => {
      if (!fixtureMode && document.visibilityState !== 'hidden')
        void loadSession();
    };
    const events = [
      'focus',
      'pageshow',
      'kiosksatellite:screenon',
      'kiosksatellite:ha-ready',
    ];
    for (const name of events) window.addEventListener(name, resume);
    document.addEventListener('visibilitychange', resume);
    if (diagnostics) modal = 'diagnostics';
    return () => {
      disposed = true;
      sessionSequence++;
      for (const name of events) window.removeEventListener(name, resume);
      document.removeEventListener('visibilitychange', resume);
      connection?.dispose();
      sessionEvents?.close();
      clearTimeout(notification);
    };
  });
  $effect(() => {
    if (!surface) {
      clearance = 0;
      return;
    }
    const element = surface;
    const update = () =>
      (clearance = element.getBoundingClientRect().height + 24);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<main
  class="screen"
  class:fixture={fixtureMode}
  class:has-surfaces={hasSurfaces}
  style:--surface-clearance={`${clearance}px`}
>
  {#if cooking && activeRecipe}
    <RecipeView
      recipe={activeRecipe}
      selected={session.selected}
      onSelect={(stepId) => mutate({ type: 'select', stepId })}
      disabled={sessionBusy || sessionLoading || needsPairing}
      {clearance}
      finish={() => mutate({ type: 'finish' })}
    />
  {:else}<AmbientView open={() => (modal = 'recipes')} />{/if}
  {#if hasSurfaces}
    <div class="surfaces" bind:this={surface}>
      {#if !fixtureMode || showTimers}<TimerPills
          timers={adapter.timers}
          control={controlTimer}
          canControl={connection?.canControl}
          {busy}
          preview={fixtureMode}
        />{/if}
      {#if (!fixtureMode || showMusic) && adapter.music}<MusicPill
          music={adapter.music}
        />{/if}
    </div>
  {/if}
  {#if sessionError && !modal}
    <div class="session-error" role="alert">
      <span>{sessionError}</span><button
        class="quiet"
        disabled={sessionBusy || sessionLoading}
        onclick={() => (needsPairing ? (modal = 'recipes') : loadSession())}
        >{needsPairing ? 'Pair kitchen' : 'Retry session'}</button
      >
    </div>
  {/if}
  <VoiceStatus {message} />
  {#if fixtureMode}
    <div class="fixture-controls" aria-label="Fixture controls">
      <span>Preview · static fixtures</span>
      <button
        onclick={() => (cooking ? (cooking = false) : (modal = 'recipes'))}
        >{cooking ? 'Ambient view' : 'Open recipe'}</button
      >
      <button
        aria-pressed={showTimers}
        onclick={() => (showTimers = !showTimers)}>Timer fixtures</button
      >
      <button aria-pressed={showMusic} onclick={() => (showMusic = !showMusic)}
        >Music fixture</button
      >
      <button onclick={() => notify('Listening… (visual preview only)')}
        >Voice feedback</button
      >
      <button onclick={() => (modal = 'diagnostics')}>Diagnostics</button>
    </div>
  {/if}
</main>
{#if modal}
  <Modal
    fullscreen={modal === 'recipes'}
    title={modal === 'recipes'
      ? 'Recipes'
      : modal === 'diagnostics'
        ? 'Device diagnostics'
        : fixtureMode
          ? 'Timer preview'
          : 'Timer'}
    close={() => {
      modal = '';
      pairingKey = '';
      pairingError = '';
    }}
  >
    {#if modal === 'recipes'}
      {#if !fixtureMode}
        {#if sessionError && !needsPairing}<p class="recipe-error" role="alert">
            {sessionError}
          </p>
          <button
            class="quiet"
            disabled={sessionBusy || sessionLoading}
            onclick={() => loadSession()}>Retry session</button
          >{/if}
        {#if needsPairing}
          <p>
            Enter this kitchen’s local pairing key. This is not a Mealie API
            token.
          </p>
          <form
            class="recipe-search"
            onsubmit={(event) => {
              event.preventDefault();
              void pair();
            }}
          >
            <label for="pairing-key">Pairing key</label><input
              id="pairing-key"
              type="password"
              autocomplete="off"
              bind:value={pairingKey}
              disabled={pairingBusy}
            />
            <button class="quiet" disabled={pairingBusy || !pairingKey.trim()}
              >{pairingBusy ? 'Pairing…' : 'Pair kitchen'}</button
            >
          </form>
          {#if pairingError}<p role="alert" class="recipe-error">
              {pairingError}
            </p>{/if}
        {:else}<RecipePicker
            busy={sessionBusy || sessionLoading}
            unauthorized={() => {
              needsPairing = true;
              sessionError = 'Pair this kitchen to access recipes.';
            }}
            open={(recipeId) => mutate({ type: 'open', recipeId })}
          />{/if}
      {:else if adapter.recipe}<p>
          Preview recipe — not connected to Mealie. Session changes are local
          and reset on reload.
        </p>
        <button class="recipe-choice" onclick={openRecipe}
          >{adapter.recipe.title}<span>{adapter.recipe.description}</span
          ></button
        >
      {:else}<p>
          Recipes aren’t connected yet. Mealie integration is planned for Phase
          3.
        </p>{/if}
    {:else if modal === 'diagnostics'}<Diagnostics
        {integration}
        {fixtureMode}
      />{/if}
  </Modal>
{/if}
