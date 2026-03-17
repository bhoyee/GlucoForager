const steps = [
  {
    title: 'Scan or type ingredients',
    description: 'Use your camera or type what you have to get recipes you can cook today.',
  },
  {
    title: 'Recipe steps + nutrition',
    description: 'Clear instructions with per-meal nutrition estimates to help you compare options.',
  },
  {
    title: 'Food swaps',
    description: 'Get practical alternatives and portion tips to reduce carb load without losing taste.',
  },
  {
    title: 'Daily tips',
    description: 'Short daily guidance to build steady habits over time.',
  },
  {
    title: 'Daily challenges',
    description: 'Simple, realistic challenges tailored to support better blood-sugar routines.',
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
