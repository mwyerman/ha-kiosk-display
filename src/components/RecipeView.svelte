<script lang="ts">
  import { untrack } from 'svelte';
  import type { Recipe } from '../lib/model';
  let {
    recipe,
    clearance,
    finish,
  }: { recipe: Recipe; clearance: number; finish: () => void } = $props();
  let servings = $state(untrack(() => recipe.servings));
  let checked = $state<string[]>([]);
  let selected = $state<number | null>(null);
  let failed = $state(false);
  function toggle(id: string) {
    checked = checked.includes(id)
      ? checked.filter((x) => x !== id)
      : [...checked, id];
  }
</script>

<div class="recipe" style={`--clearance: ${clearance}px`}>
  <section class="left" aria-label="Recipe ingredients">
    <div class="photo">
      {#if !failed}<img
          src={recipe.photo}
          alt={recipe.title}
          onerror={() => (failed = true)}
        />{:else}<span>Recipe photograph unavailable</span>{/if}
    </div>
    <div>
      <h1 class="name">{recipe.title}</h1>
      <div class="sub">{recipe.description} · {servings} servings</div>
    </div>
    <div class="ingredients">
      <div class="row">
        <h2 class="eyebrow">Ingredients</h2>
        <div class="portion">
          <button
            class="mini"
            aria-label="Fewer servings"
            disabled={servings <= 1}
            onclick={() => servings--}>−</button
          ><span aria-live="polite">{servings}</span><button
            class="mini"
            aria-label="More servings"
            disabled={servings >= 12}
            onclick={() => servings++}>+</button
          >
        </div>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (scroll regions need keyboard access) -->
      <div
        class="ingredientlist"
        tabindex="0"
        role="region"
        aria-label="Scrollable ingredients"
      >
        {#each recipe.ingredients as ingredient (ingredient.id)}
          <button
            class="ing"
            class:checked={checked.includes(ingredient.id)}
            aria-pressed={checked.includes(ingredient.id)}
            onclick={() => toggle(ingredient.id)}
          >
            <span class="box" aria-hidden="true"
              >{checked.includes(ingredient.id) ? '✓' : ''}</span
            >
            <span class="amt"
              >{ingredient.amount === null
                ? ''
                : Math.round(
                    ((ingredient.amount * servings) / recipe.servings) * 10,
                  ) / 10}
              {ingredient.unit}</span
            ><span>{ingredient.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>
  <section class="rightcol" aria-label="Recipe instructions">
    <div class="righthead">
      <div>
        <h2 class="eyebrow">Instructions · {recipe.steps.length} steps</h2>
        <p class="hint">Scroll freely or tap a step to highlight it.</p>
      </div>
      <button class="quiet" onclick={finish}>Finish cooking</button>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scroll regions need keyboard access) -->
    <div
      class="steps"
      tabindex="0"
      role="region"
      aria-label="Scrollable instructions"
    >
      {#each recipe.steps as step, i}
        <button
          class="step"
          class:selected={selected === i}
          aria-pressed={selected === i}
          onclick={() => (selected = selected === i ? null : i)}
        >
          <span class="stepnum">Step {i + 1}</span><strong>{step.title}</strong
          ><span class="steptext">{step.text}</span>
        </button>
      {/each}
    </div>
  </section>
</div>
