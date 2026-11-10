<script lang="ts">
  import type { Timer } from '../lib/model';
  let { timers, select }: { timers: Timer[]; select: (timer: Timer) => void } =
    $props();
</script>

<div class="pill-row" aria-label="Timers">
  {#each timers as timer (timer.id)}
    <button
      class="pill timer-pill"
      class:done={timer.finished}
      onclick={() => select(timer)}
      ><span
        ><span class="pill-label">{timer.label}</span><b>{timer.remaining}</b
        ></span
      ><span aria-hidden="true">{timer.finished ? '!' : '◷'}</span></button
    >
  {/each}
</div>
