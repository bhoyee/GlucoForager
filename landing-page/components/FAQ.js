const faqs = [
  {
    q: 'How do you keep recipes diabetes-friendly?',
    a: 'We filter by glycemic impact first, then score ingredient matches to keep options low-carb and low-glycemic.',
  },
  {
    q: 'Do you store my ingredient photos?',
    a: 'Photos stay on-device during the mock phase. Production OCR will be opt-in with encrypted transit.',
  },
  {
    q: 'What happens after the trial?',
    a: 'Premium is £2.99/month. Cancel anytime from your profile before renewal.',
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="space-y-4">
      {faqs.map((item) => (
        <div key={item.q} className="rounded-2xl border border-slate-700 bg-surface/60 p-4">
          <p className="font-semibold text-slate-100">{item.q}</p>
          <p className="text-slate-300 mt-1">{item.a}</p>
        </div>
      ))}
    </section>
  );
}
