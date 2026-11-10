<script lang="ts">
  import { onMount } from 'svelte';
  let report = $state('');
  let notes = $state('');
  function refresh() {
    report = JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          pixelRatio: devicePixelRatio,
        },
        visualViewport: window.visualViewport
          ? {
              width: window.visualViewport.width,
              height: window.visualViewport.height,
            }
          : null,
        screen: { width: screen.width, height: screen.height },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        visibility: document.visibilityState,
        secureContext: window.isSecureContext,
        bridge:
          'UNVERIFIED — browser metrics do not establish Kiosk Satellite API or HA connection availability',
      },
      null,
      2,
    );
  }
  onMount(() => {
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  });
</script>

<p>
  Local browser metrics only. No bridge methods are guessed or invoked; no
  credentials or HA state are read.
</p>
<pre class="diagnostic-report">{report}</pre>
<label for="device-notes">Device test notes (keyboard check; not saved)</label>
<textarea
  id="device-notes"
  bind:value={notes}
  placeholder="Portal version, scroll behavior, bridge documentation…"
></textarea>
<button class="quiet" onclick={refresh}>Refresh metrics</button>
