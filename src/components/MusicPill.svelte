<script lang="ts">
  import type { Music } from '../lib/model';
  let { music }: { music: Music } = $props();
</script>

<div class="pill music-pill" aria-label="Playing music">
  <span class="disc" aria-hidden="true">♫</span><span class="meta"
    ><span class="pill-label">{music.artist}</span><strong>{music.title}</strong
    ></span
  >
</div>
