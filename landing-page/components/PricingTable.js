const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    bullets: [
      'Unlimited barcode scanning for a diabetes-friendly verdict',
      'Glucose and meal logging, with your daily carb goal',
      'Browse recipes, tips & the daily challenge',
      'Save favourites and view recent recipes',
      '7-day free trial for AI recipe generation and AI photo food scan',
    ],
    ctaLabel: 'Perfect for quick checks and light use.',
    ctaHref: null,
  },
  {
    name: 'Premium',
    price: '$5.99',
    period: '/ month',
    highlight: true,
    bullets: [
      'Unlimited AI photo food scans',
      'Daily Meal Planner',
      'Higher usage limits for AI recipes',
      'Food swaps + personalised guidance',
      'Ad-free experience',
    ],
    ctaLabel: 'Download the app',
    ctaHref: '/download',
  },
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-none text-teal-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingTable() {
  return (
    <section id="pricing" className="grid gap-6 md:grid-cols-2 items-stretch">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
            tier.highlight ? 'border-teal-600 bg-teal-50/60' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-2xl font-bold text-gray-900">{tier.name}</h3>
            <span className="text-xl font-semibold text-gray-900 whitespace-nowrap">
              {tier.price}
              <span className="ml-1 text-sm font-medium text-gray-500">{tier.period}</span>
            </span>
          </div>

          <ul className="mt-5 space-y-3 text-gray-700">
            {tier.bullets.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-6 border-t border-gray-200">
            {tier.ctaHref ? (
              <a
                className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 transition-colors"
                href={tier.ctaHref}
              >
                {tier.ctaLabel}
              </a>
            ) : (
              <p className="text-sm text-gray-500">{tier.ctaLabel}</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
