const steps = [
  {
    title: 'Start with your real ingredients',
    description:
      'Scan the fridge, pantry, or type what you have. You can review the list before anything is used.',
    detail: 'Scan or type',
  },
  {
    title: 'GlucoForager checks the food context',
    description:
      'The app looks for a more balanced direction, highlights better choices, and avoids ingredients that are less useful for steadier blood sugar.',
    detail: 'Review guidance',
  },
  {
    title: 'Choose a practical next step',
    description:
      'Get recipe ideas, food swaps, or a daily plan with clear cooking steps and food decisions you can act on.',
    detail: 'Cook, swap, or plan',
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
