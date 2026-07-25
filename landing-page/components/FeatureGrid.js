const steps = [
  {
    title: 'Get a recipe your way',
    description: 'Scan your fridge or pantry, type what you have, or tap Surprise Me for instant diabetes-friendly recipe ideas.',
  },
  {
    title: 'Recipe steps & nutrition facts',
    description: 'Clear cooking instructions with per-meal nutrition estimates (calories, carbs, protein, and fibre) to help you compare options.',
  },
  {
    title: 'Food swaps',
    description: 'Get practical alternatives and portion tips to reduce carb load without losing the foods you like.',
  },
  {
    title: 'Shopping list',
    description: 'Build a list from scratch or straight from a recipe, and check items off as you shop.',
  },
  {
    title: 'GlucoGuide AI',
    description: 'Ask quick food questions and get everyday, profile-aware guidance whenever you are unsure.',
  },
  {
    title: 'Daily tips',
    description: 'Short daily guidance to build steady blood-sugar habits over time.',
  },
  {
    title: 'Daily challenges & streaks',
    description: 'Simple, realistic challenges with milestone celebrations at 7, 30, and 100 days.',
  },
  {
    title: 'Favourites & recipe history',
    description: 'Save meals and revisit recent recipes so successful choices become easier to repeat.',
  },
  {
    title: 'Weekly recap',
    description: 'See the recipes you made, your favourites, your streak, and your recipe of the week.',
  },
  {
    title: 'Daily Meal Planner (Premium)',
    description: 'Generate a full-day plan: breakfast, lunch, dinner, and snack.',
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="grid gap-4 md:grid-cols-3">
      {steps.map((step, idx) => (
        <div key={step.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="badge mb-3">Feature {idx + 1}</div>
          <h3 className="text-xl font-semibold text-gray-900">{step.title}</h3>
          <p className="mt-2 text-gray-600">{step.description}</p>
        </div>
      ))}
    </section>
  );
}
