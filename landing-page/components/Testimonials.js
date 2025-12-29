const testimonials = [
  {
    name: 'Amira, Type 2',
    quote: 'Finally a recipe app that filters out the spike-heavy stuff. My dietician approves.',
  },
  {
    name: 'David, Pre-Diabetes',
    quote: 'I just type what is in my fridge and get 3 safe options. Stress gone.',
  },
];

export default function Testimonials() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {testimonials.map((item) => (
        <div key={item.name} className="rounded-2xl border border-slate-700 bg-surface/60 p-5">
          <p className="text-slate-200">“{item.quote}”</p>
          <p className="mt-3 text-sm text-slate-400">{item.name}</p>
        </div>
      ))}
    </section>
  );
}
