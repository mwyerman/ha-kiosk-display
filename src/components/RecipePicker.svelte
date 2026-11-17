<script lang="ts">
  import { onMount } from 'svelte';
  import type { Recipe } from '../lib/model';
  let {
    open,
    busy,
    unauthorized,
  }: { open: (id: string) => void; busy: boolean; unauthorized: () => void } =
    $props();
  type Summary = Pick<Recipe, 'id' | 'title' | 'photo' | 'description'>;
  let items = $state<Summary[]>([]);
  let search = $state('');
  let query = '';
  let page = $state(1);
  let totalPages = $state(1);
  let total = $state(0);
  let loading = $state(false);
  let error = $state('');
  let sequence = 0;
  async function load(nextPage = 1, nextQuery = query) {
    const request = ++sequence;
    loading = true;
    error = '';
    try {
      const response = await fetch(
        `/api/recipes?${new URLSearchParams({ search: nextQuery, page: String(nextPage) })}`,
        { credentials: 'same-origin' },
      );
      if (request !== sequence) return;
      if (response.status === 401) {
        unauthorized();
        return;
      }
      if (!response.ok)
        throw new Error('Unable to load recipes. Please try again.');
      const result = await response.json();
      if (request !== sequence) return;
      items = result.items;
      page = result.page;
      totalPages = result.totalPages;
      total = result.total;
      query = nextQuery;
    } catch {
      if (request === sequence)
        error = 'Unable to load recipes. Please try again.';
    } finally {
      if (request === sequence) loading = false;
    }
  }
  onMount(() => {
    void load();
    return () => {
      sequence++;
    };
  });
</script>

<form
  class="recipe-search"
  onsubmit={(event) => {
    event.preventDefault();
    void load(1, search);
  }}
>
  <label for="recipe-search">Search recipes</label>
  <div class="search-row">
    <input id="recipe-search" type="search" bind:value={search} /><button
      class="quiet"
      disabled={loading || busy}>Search</button
    >
  </div>
</form>
{#if error}<p role="alert" class="recipe-error">{error}</p>
  <button class="quiet" onclick={() => load()}>Retry recipes</button>{/if}
{#if loading}<p role="status">Loading recipes…</p>{/if}
<div class="recipe-results" aria-busy={loading || busy}>
  {#each items as item (item.id)}
    <button
      class="recipe-choice recipe-summary"
      disabled={loading || busy}
      onclick={() => open(item.id)}
    >
      {#if item.photo}<img
          src={item.photo}
          alt=""
          onerror={(event) => {
            (event.currentTarget as HTMLImageElement).hidden = true;
          }}
        />{:else}<span class="recipe-thumbnail" aria-hidden="true">Recipe</span
        >{/if}
      <span><strong>{item.title}</strong><span>{item.description}</span></span>
    </button>
  {/each}
</div>
{#if !loading && !error && !items.length}<p>No recipes found.</p>{/if}
<div class="recipe-pagination">
  <button
    class="quiet"
    aria-label="Previous page"
    disabled={loading || busy || page <= 1}
    onclick={() => load(page - 1)}>Previous</button
  >
  <span>Page {page} of {Math.max(1, totalPages)} · {total} recipes</span>
  <button
    class="quiet"
    aria-label="Next page"
    disabled={loading || busy || page >= totalPages}
    onclick={() => load(page + 1)}>Next</button
  >
</div>
