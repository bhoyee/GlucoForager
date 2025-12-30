const steps = [
  {
    title: 'AI Vision + Text',
    description: 'GPT-5 Vision and text input extract your ingredients in seconds.',
  },
  {
    title: 'Diabetes Safety First',
    description: 'Low-GI filters and dietitian-inspired prompts guard every recipe.',
  },
  {
    title: 'Tier-aware speed',
    description: 'Free: 3 scans/day with caching. Premium: unlimited priority AI.',
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="grid gap-4 md:grid-cols-3">
      {steps.map((step, idx) => (
        <div key={step.title} className="rounded-2xl border border-slate-700 bg-surface/60 p-6 shadow-lg">
          <div className="badge mb-3">Step {idx + 1}</div>
          <h3 className="text-xl font-semibold">{step.title}</h3>
          <p className="mt-2 text-slate-300">{step.description}</p>
        </div>
      ))}
    </section>
  );
}
