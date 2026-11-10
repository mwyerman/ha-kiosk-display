<script lang="ts">
  let { message }: { message: string } = $props();
</script>

<div class="talk" class:on={Boolean(message)} role="status">{message}</div>
