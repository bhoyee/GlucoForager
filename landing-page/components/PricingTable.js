const tiers = [
  {
    name: 'Free',
    price: '£0',
    bullets: ['3 AI scans/day', 'Text + basic vision input', 'Banner ads', 'Cached AI responses'],
  },
  {
    name: 'Premium',
    price: '£2.99/month',
    highlight: true,
    bullets: [
      'Unlimited scans with GPT-5 Vision',
      'Priority AI + dietary filters',
      'Save favorites & history',
      'Ad-free experience',
      'Coming soon: meal plans & shopping lists',
    ],
  },
];

export default function PricingTable() {
  return (
    <section id="pricing" className="grid gap-6 md:grid-cols-2">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`rounded-2xl border p-6 shadow-xl ${
            tier.highlight ? 'border-primary bg-primary/5' : 'border-slate-700 bg-surface/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold">{tier.name}</h3>
            <span className="text-xl font-semibold">{tier.price}</span>
          </div>
          <ul className="mt-4 space-y-2 text-slate-200">
            {tier.bullets.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="badge">{item.includes('Camera') ? 'Camera' : 'Included'}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {tier.highlight ? (
            <a className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 font-semibold text-midnight" href="#download">
              Start 7-day free trial
            </a>
          ) : (
            <p className="mt-6 text-sm text-slate-400">Perfect for quick checks and light use.</p>
          )}
        </div>
      ))}
    </section>
  );
}
