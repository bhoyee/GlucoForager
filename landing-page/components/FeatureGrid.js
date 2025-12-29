const steps = [
  {
    title: 'Type or Scan',
    description: 'Enter ingredients or snap a photo. OCR is tuned for pantry staples.',
  },
  {
    title: 'Diabetes-Safe Match',
    description: 'We filter by glycemic impact before scoring ingredient overlap.',
  },
  {
    title: 'Cook with Confidence',
    description: 'Clear nutrition and missing items keep you on track.',
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
