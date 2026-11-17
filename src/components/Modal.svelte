<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  let {
    title,
    close,
    children,
    fullscreen = false,
  }: {
    title: string;
    close: () => void;
    children: Snippet;
    fullscreen?: boolean;
  } = $props();
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;
  onMount(() => {
    dialog.showModal();
    if (fullscreen) heading.focus({ preventScroll: true });
    return () => dialog.close();
  });
</script>

<dialog
  class:fullscreen
  bind:this={dialog!}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <div class="modal">
    <!-- svelte-ignore a11y_autofocus (focus heading, never summon the touch keyboard) -->
    <h2 bind:this={heading!} tabindex="-1" autofocus={fullscreen}>{title}</h2>
    {@render children()}
    <div class="modal-actions"><button onclick={close}>Close</button></div>
  </div>
</dialog>
