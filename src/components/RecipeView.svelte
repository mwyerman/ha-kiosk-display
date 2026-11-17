<script lang="ts">
  import type { Recipe } from '../lib/model';
  let {
    recipe,
    clearance,

    selected,

    onSelect,
    finish,
    disabled = false,
  }: {
    recipe: Recipe;
    clearance: number;

    selected: string | null;

    onSelect: (id: string | null) => void;
    finish: () => void;
    disabled?: boolean;
  } = $props();
  let failedPhoto = $state<string | null>(null);
  const source = $derived(
    recipe.source && /^https?:\/\//i.test(recipe.source) ? recipe.source : null,
  );
</script>

<div
  class="recipe recipe-compact"
  style={`--clearance: ${clearance}px`}
  aria-busy={disabled}
>
  {#if recipe.photo && failedPhoto !== recipe.photo}
    <img
      class="recipe-backdrop"
      src={recipe.photo}
      alt=""
      onerror={() => (failedPhoto = recipe.photo)}
    />
  {/if}
  <header class="recipe-titlebar">
    <h1 class="name">{recipe.title}</h1>
    <button class="quiet" {disabled} onclick={finish}>Finish cooking</button>
  </header>
  <section class="left" aria-label="Recipe ingredients">
    <div class="ingredients">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (scroll regions need keyboard access) -->
      <div
        class="ingredientlist"
        tabindex="0"
        role="region"
        aria-label="Scrollable ingredients"
      >
        {#each recipe.ingredients as ingredient, i (ingredient.id)}
          {#if ingredient.section && (i === 0 || ingredient.section !== recipe.ingredients[i - 1].section)}
            <h3 class="recipe-section">{ingredient.section}</h3>
          {/if}
          <div class="ing">
            <span class="ingredient-text">{ingredient.text}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>
  <section class="rightcol" aria-label="Recipe instructions">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scroll regions need keyboard access) -->
    <div
      class="steps"
      tabindex="0"
      role="region"
      aria-label="Scrollable instructions"
    >
      {#each recipe.steps as step, i (step.id)}
        {#if step.section && (i === 0 || step.section !== recipe.steps[i - 1].section)}<h3
            class="recipe-section"
          >
            {step.section}
          </h3>{/if}
        <button
          class="step"
          class:selected={selected === step.id}
          aria-pressed={selected === step.id}
          {disabled}
          onclick={() => onSelect(selected === step.id ? null : step.id)}
        >
          <span class="step-heading"
            ><span class="stepnum">Step {i + 1}</span>{#if step.title}<span
                class="step-separator"
                aria-hidden="true">·</span
              ><strong>{step.title}</strong>{/if}</span
          >
          <span class="steptext">{step.text}</span>
        </button>
      {/each}
      {#if source}<a
          class="recipe-source"
          href={source}
          target="_blank"
          rel="noopener noreferrer">Original recipe</a
        >{/if}
    </div>
  </section>
</div>
