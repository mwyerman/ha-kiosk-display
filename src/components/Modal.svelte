<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  let {
    title,
    close,
    children,
  }: { title: string; close: () => void; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    dialog.showModal();
    return () => dialog.close();
  });
</script>

<dialog
  bind:this={dialog!}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <div class="modal">
    <h2>{title}</h2>
    {@render children()}
    <div class="modal-actions"><button onclick={close}>Close</button></div>
  </div>
</dialog>
