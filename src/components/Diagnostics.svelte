<script lang="ts">
  import { onMount } from 'svelte';
  import type { IntegrationStatus } from '../lib/kiosk';
  let {
    integration,
    fixtureMode,
  }: { integration: IntegrationStatus; fixtureMode: boolean } = $props();
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
          'Browser metrics only — see integration status above; on-device acceptance remains unverified',
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
  Browser metrics and documented integration status. No tokens or raw HA state
  are displayed.
</p>
<h3>
  Integration {fixtureMode ? '(fixture mode — live connection disabled)' : ''}
</h3>
<pre class="diagnostic-report">{JSON.stringify(integration, null, 2)}</pre>
{#if integration.nativeNowPlaying}<p>
    The kiosk reports native full-screen Now Playing is shown. Review its media
    settings to keep the recipe foregrounded; this page does not change them.
  </p>{/if}
<pre class="diagnostic-report">{report}</pre>
<label for="device-notes">Device test notes (keyboard check; not saved)</label>
<textarea
  id="device-notes"
  bind:value={notes}
  placeholder="Portal version, scroll behavior, bridge documentation…"
></textarea>
<button class="quiet" onclick={refresh}>Refresh metrics</button>
