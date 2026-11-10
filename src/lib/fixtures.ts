import type { DisplayAdapter } from './model';
// Static presentation fixtures only: no timer engine, music engine, or mock voice parser.
export const fixtureAdapter: DisplayAdapter = {
  recipe: {
    id: 'fixture-pasta',
    title: 'Creamy Tomato Pasta',
    photo: '/photos/pasta.jpg',
    description: '30 min · Easy',
    servings: 4,
    ingredients: [
      ['Olive oil', 2, 'tbsp'],
      ['Garlic cloves', 4, ''],
      ['Crushed tomatoes', 400, 'g'],
      ['Heavy cream', 200, 'ml'],
      ['Pasta', 350, 'g'],
      ['Fresh basil', 1, 'handful'],
      ['Salt & black pepper', null, 'to taste'],
      ['Parmesan cheese', 40, 'g'],
    ].map(([name, amount, unit], i) => ({
      id: `ingredient-${i}`,
      name: String(name),
      amount: amount as number | null,
      unit: String(unit),
    })),
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
    ].map(([title, text]) => ({ title, text })),
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
