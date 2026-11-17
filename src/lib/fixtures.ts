import type { DisplayAdapter } from './model';
// Static presentation fixtures only: no timer engine, music engine, or mock voice parser.
export const fixtureAdapter: DisplayAdapter = {
  recipe: {
    id: 'fixture-pasta',
    title: 'Creamy Tomato Pasta',
    photo: '/photos/pasta.jpg',
    description: '30 min · Easy',
    servings: 4,
    yield: null,
    source: null,
    ingredients: [
      '2 tbsp Olive oil',
      '4 Garlic cloves',
      '400 g Crushed tomatoes',
      '200 ml Heavy cream',
      '350 g Pasta',
      '1 handful Fresh basil',
      'Salt & black pepper to taste',
      '40 g Parmesan cheese',
    ].map((text, i) => ({ id: `ingredient-${i}`, text, section: null })),
    steps: [
      [
        'Prepare your ingredients',
        'Mince the garlic, roughly chop the basil, and measure out the cream and tomatoes.',
      ],
      [
        'Sauté the garlic',
        'Heat olive oil in a large pan over medium heat. Add garlic and cook until fragrant, about 1–2 minutes.',
      ],
      [
        'Make the tomato sauce',
        'Add the tomatoes, stir to combine, and simmer gently for 10 minutes. Season with salt and pepper.',
      ],
      [
        'Add the cream',
        'Lower the heat and stir in the cream. Let the sauce warm through without boiling.',
      ],
      [
        'Cook the pasta',
        'Boil the pasta until al dente, then reserve some cooking water before draining.',
      ],
      [
        'Combine pasta and sauce',
        'Toss the pasta with the sauce. Add a splash of cooking water if needed to loosen.',
      ],
      [
        'Finish and serve',
        'Top with basil and parmesan, then serve immediately.',
      ],
    ].map(([title, text], i) => ({
      id: `step-${i}`,
      title,
      text,
      section: null,
    })),
  },
  timers: [
    {
      id: 'pasta',
      label: 'Pasta · preview',
      remaining: '08:00',
      finished: false,
    },
    {
      id: 'tea',
      label: 'Tea · preview',
      remaining: 'Time is up',
      finished: true,
    },
  ],
  music: { title: 'Soft Sunday', artist: 'Kitchen speaker · preview' },
};
