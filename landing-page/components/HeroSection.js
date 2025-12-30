export default function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-surface to-midnight p-10 shadow-xl">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,183,3,0.18),transparent_30%)]" />
      <div className="relative grid gap-8 lg:grid-cols-2 items-center">
        <div>
          <span className="badge mb-4">AI-powered diabetes-safe recipes</span>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Snap your fridge, get 3 diabetes-friendly recipes in 60 seconds
          </h1>
          <p className="mt-4 text-slate-200">
            GPT-5 Vision scans your fridge, applies diabetic safety rules, and serves low-GI meals instantly.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a
              href="#pricing"
              className="rounded-xl bg-primary px-5 py-3 font-semibold text-midnight shadow-lg shadow-primary/30"
            >
              Start 7-day free trial
            </a>
            <a href="#download" className="rounded-xl border border-slate-600 px-5 py-3 font-semibold">
              See app in action
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Free: 3 AI scans/day • Premium: £2.99/month unlimited with priority AI & favorites
          </p>
        </div>
        <div className="relative rounded-2xl bg-surface/60 p-6 border border-surface">
          <div className="flex justify-between text-sm text-slate-300 mb-3">
            <span>Type / Scan</span>
            <span>Match</span>
            <span>Cook</span>
          </div>
          <div className="rounded-xl bg-midnight p-5 border border-slate-700">
            <p className="text-slate-200 mb-3">“chicken breast, spinach, garlic”</p>
            <div className="space-y-2">
              {['Lemon garlic salmon', 'Chicken veggie stir fry', 'Spinach omelette'].map((recipe) => (
                <div key={recipe} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <div>
                    <p className="text-slate-100 font-semibold">{recipe}</p>
                    <p className="text-xs text-slate-400">Diabetes-friendly • Ready in 25 mins</p>
                  </div>
                  <span className="badge">Uses your items</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
