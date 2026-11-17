export interface Ingredient {
  id: string;
  text: string;
  section: string | null;
}
export interface Recipe {
  id: string;
  title: string;
  photo: string | null;
  description: string;
  servings: number | null;
  yield: string | null;
  source: string | null;
  ingredients: Ingredient[];
  steps: { id: string; title: string; text: string; section: string | null }[];
}
export interface RecipeSession {
  revision: number;
  recipe: Recipe | null;
  checked: string[];
  selected: string | null;
}
export interface Timer {
  id: string;
  label: string;
  remaining: string;
  finished: boolean;
  paused?: boolean;
}
export interface Music {
  title: string;
  artist: string;
}
export interface DisplayAdapter {
  recipe: Recipe | null;
  timers: Timer[];
  music: Music | null;
}
// Phase 1 production deliberately has no simulated service state.
export const disconnectedAdapter: DisplayAdapter = {
  recipe: null,
  timers: [],
  music: null,
};
