const tiers = [
  {
    name: 'Free',
    price: '$0',
    bullets: [
      'Ingredient scan + typed ingredients',
      'Daily tips & challenges',
      'Save favourites and view recent recipes',
      'Limited AI generations',
    ],
  },
  {
    name: 'Premium',
    price: 'From $5.99/month',
    highlight: true,
    bullets: [
      'Daily Meal Planner',
      'Higher usage limits for AI recipes and scans',
      'Food swaps + personalised guidance',
      'Ad-free experience',
    ],
  },
];

export default function PricingTable() {
  return (
    <section id="pricing" className="grid gap-6 md:grid-cols-2">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`rounded-2xl border p-6 shadow-sm ${
            tier.highlight ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-gray-900">{tier.name}</h3>
            <span className="text-xl font-semibold text-gray-900">{tier.price}</span>
          </div>
          <ul className="mt-4 space-y-2 text-gray-700">
            {tier.bullets.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="badge">Included</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {tier.highlight ? (
            <a className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 font-semibold text-midnight" href="/download">
              Download the app
            </a>
          ) : (
            <p className="mt-6 text-sm text-gray-500">Perfect for quick checks and light use.</p>
          )}
        </div>
      ))}
    </section>
  );
}

