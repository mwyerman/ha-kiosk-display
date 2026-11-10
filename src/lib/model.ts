export interface Ingredient {
  id: string;
  name: string;
  amount: number | null;
  unit: string;
}
export interface Recipe {
  id: string;
  title: string;
  photo: string;
  description: string;
  servings: number;
  ingredients: Ingredient[];
  steps: { title: string; text: string }[];
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
