<script lang="ts">
  import type { Timer } from '../lib/model';
  import type { TimerAction } from '../lib/kiosk';
  let {
    timers,
    control,
    canControl = false,
    busy = false,
    preview = false,
  }: {
    timers: Timer[];
    control: (id: string, action: TimerAction) => Promise<void>;
    canControl?: boolean;
    busy?: boolean;
    preview?: boolean;
  } = $props();
  let expanded = $state('');
  let confirming = $state('');
  $effect(() => {
    if (!timers.some((timer) => timer.id === expanded && !timer.finished))
      expanded = '';
    if (!timers.some((timer) => timer.id === confirming && !timer.finished))
      confirming = '';
  });
  function toggle(id: string) {
    expanded = expanded === id ? '' : id;
    confirming = '';
  }
  async function act(id: string, action: TimerAction) {
    confirming = '';
    await control(id, action);
  }
</script>

<div class="pill-row timer-row" aria-label="Timers">
  {#each timers as timer (timer.id)}
    {#if timer.finished && !preview}
      <a
        class="timer-pill compact-timer done"
        href="ks://voice/stop"
        aria-label={`Dismiss ${timer.label} timer`}
      >
        <span class="timer-summary"
          ><span class="timer-name">{timer.label}</span><b>Tap to dismiss</b
          ></span
        >
      </a>
    {:else}
      <div
        class="timer-pill compact-timer"
        class:expanded={expanded === timer.id}
        class:done={timer.finished}
        role="group"
        aria-label={`${timer.label} timer`}
      >
        <button
          class="timer-toggle"
          aria-expanded={expanded === timer.id}
          aria-controls={`timer-options-${timer.id}`}
          onclick={() => toggle(timer.id)}
        >
          <span class="timer-summary"
            ><span class="timer-name"
              >{timer.label}{timer.paused ? ' · Paused' : ''}</span
            ><b>{timer.remaining}</b></span
          >
          <span class="timer-chevron" aria-hidden="true">›</span>
        </button>
        <div
          class="timer-slide"
          id={`timer-options-${timer.id}`}
          inert={expanded !== timer.id}
        >
          <div class="timer-slide-inner">
            {#if preview}<span class="timer-state">Static preview</span>
            {:else if canControl}
              <div class="timer-controls">
                {#if confirming === timer.id}
                  <button
                    class="timer-end"
                    disabled={busy}
                    onclick={() => act(timer.id, 'cancel')}>End timer?</button
                  >
                  <button disabled={busy} onclick={() => (confirming = '')}
                    >Keep</button
                  >
                {:else}
                  <button
                    disabled={busy}
                    onclick={() =>
                      act(timer.id, timer.paused ? 'resume' : 'pause')}
                    >{timer.paused ? 'Resume' : 'Pause'}</button
                  >
                  <button disabled={busy} onclick={() => act(timer.id, 'add')}
                    >+1 min</button
                  >
                  <button
                    class="timer-end"
                    disabled={busy}
                    onclick={() => (confirming = timer.id)}>End</button
                  >
                {/if}
              </div>
            {:else}<span class="timer-state">Controls unavailable</span>{/if}
          </div>
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .compact-timer {
    flex: 0 0 auto;
    max-width: none;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    padding: 0;
    border-radius: 999px;
    min-height: 68px;
  }
  a.compact-timer {
    padding: 10px 22px;
    min-height: 68px;
  }
  .timer-toggle {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 18px;
    min-height: 68px;
    border-radius: 999px;
    background: transparent;
    flex: none;
  }
  .timer-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .timer-summary .timer-name {
    font-size: 13px;
    font-weight: 550;
    max-width: 180px;
  }
  .timer-summary b {
    font-size: 23px;
    white-space: nowrap;
  }
  .timer-chevron {
    font-size: 26px;
    opacity: 0.65;
    transition: transform 200ms ease;
  }
  .expanded .timer-chevron {
    transform: rotate(180deg);
  }
  .timer-slide {
    display: grid;
    grid-template-columns: 0fr;
    opacity: 0;
    visibility: hidden;
    transition:
      grid-template-columns 220ms ease,
      opacity 180ms ease,
      visibility 220ms;
  }
  .expanded .timer-slide {
    grid-template-columns: 1fr;
    opacity: 1;
    visibility: visible;
  }
  .timer-slide-inner {
    overflow: hidden;
    min-width: 0;
  }
  .timer-controls {
    width: max-content;
    padding: 0 12px 0 2px;
    gap: 7px;
  }
  .timer-controls button {
    min-height: 48px;
    padding: 10px 15px;
    flex: none;
    font-size: 16px;
    white-space: nowrap;
    border-radius: 999px;
  }
  .timer-state {
    display: block;
    width: max-content;
    padding-right: 20px;
  }
  @media (prefers-reduced-motion: reduce) {
    .timer-slide,
    .timer-chevron {
      transition: none;
    }
  }
</style>
