<script lang="ts">
  import { onMount } from 'svelte';
  import AmbientView from './components/AmbientView.svelte';
  import RecipeView from './components/RecipeView.svelte';
  import TimerPills from './components/TimerPills.svelte';
  import MusicPill from './components/MusicPill.svelte';
  import Modal from './components/Modal.svelte';
  import VoiceStatus from './components/VoiceStatus.svelte';
  import Diagnostics from './components/Diagnostics.svelte';
  import { disconnectedAdapter, type DisplayAdapter } from './lib/model';
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
    cooking = true;
    modal = '';
    notify('Recipe opened');
  }
  onMount(() => {
    if (fixtureMode)
      void import('./lib/fixtures').then(
        ({ fixtureAdapter }) => (adapter = fixtureAdapter),
      );
    if (!fixtureMode)
      connection = connectKiosk((timers, music, status) => {
        adapter = { ...adapter, timers, music };
        integration = status;
      });
    if (diagnostics) modal = 'diagnostics';
    return () => {
      connection?.dispose();
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
  {#if cooking && adapter.recipe}
    <RecipeView
      recipe={adapter.recipe}
      {clearance}
      finish={() => {
        cooking = false;
        notify('Cooking session finished');
      }}
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
    title={modal === 'recipes'
      ? 'Recipes'
      : modal === 'diagnostics'
        ? 'Device diagnostics'
        : fixtureMode
          ? 'Timer preview'
          : 'Timer'}
    close={() => (modal = '')}
  >
    {#if modal === 'recipes'}
      {#if adapter.recipe}<p>
          Preview recipe — not connected to Mealie. Session changes are local
          and reset on reload.
        </p>
        <button class="recipe-choice" onclick={openRecipe}
          >{adapter.recipe.title}<span>30 min · 4 servings</span></button
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
