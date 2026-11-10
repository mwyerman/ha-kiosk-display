<script lang="ts">
  import { onMount } from 'svelte';
  let now = $state(new Date());
  let failed = $state(false);
  let { open }: { open: () => void } = $props();
  onMount(() => {
    const update = () => (now = new Date());
    const interval = setInterval(update, 15000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pageshow', update);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pageshow', update);
    };
  });
</script>

<button class="ambient" onclick={open} aria-label="Open recipes">
  {#if !failed}<img
      class="framephoto"
      src="/photos/ambient.jpg"
      alt="Sunlit meadow"
      onerror={() => (failed = true)}
    />{/if}
  <span class="shade"></span>
  <span class="ambient-info">
    <span class="idleclock"
      >{now.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}</span
    >
    <span class="idledate"
      >{now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}</span
    >
  </span>
</button>
