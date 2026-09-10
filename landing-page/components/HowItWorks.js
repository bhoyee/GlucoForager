const steps = [
  {
    title: 'Scan a food, or start with what you have',
    description:
      'Scan a barcode or photo for an instant verdict on a specific product or meal, or scan your fridge/pantry to see what you can cook with what you already have.',
    detail: 'Scan a barcode, photo, or your pantry',
  },
  {
    title: 'GlucoForager checks the food context',
    description:
      'Get a clear diabetes-friendly verdict with carbs, sugar, and fibre for a scanned item, or a more balanced direction and better choices for a full meal.',
    detail: 'Review your verdict or guidance',
  },
  {
    title: 'Log it and see the pattern build',
    description:
      'Log the meal or a glucose reading, watch your daily carb target fill in on the home screen, and get flagged automatically if a reading follows a meal by more than expected.',
    detail: 'Track, log, or plan',
  },
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7 lg:p-9">
        <div className="grid gap-0 lg:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className={`group relative overflow-hidden px-0 py-7 transition duration-300 ease-out hover:-translate-y-1 sm:px-2 lg:px-7 lg:py-2 ${
                index > 0 ? 'border-t border-white/10 lg:border-l lg:border-t-0' : ''
              }`}
              style={{ transitionDelay: `${index * 45}ms` }}
            >
              <div className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-teal-200/0 via-teal-200/70 to-teal-200/0 transition-transform duration-500 group-hover:scale-x-100" />
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-teal-200/30 bg-transparent text-sm font-bold text-teal-100 transition duration-300 group-hover:border-teal-200/70 group-hover:bg-teal-200/10">
                  {index + 1}
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200/80">{step.detail}</p>
              </div>

              <h3 className="text-xl font-bold leading-tight text-white transition-colors duration-300 group-hover:text-teal-50 sm:text-2xl">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-teal-50/75 transition-colors duration-300 group-hover:text-teal-50/90">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
