const screenshots = [
  { title: 'Ingredient input', caption: 'Tag inputs tuned for low-glycemic meals.' },
  { title: 'Results', caption: 'Exactly 3 diabetes-safe matches with missing items.' },
  { title: 'Recipe detail', caption: 'Why it is safe, nutrition, and favorites.' },
];

export default function ScreenshotGallery() {
  return (
    <section id="gallery" className="grid gap-4 md:grid-cols-3">
      {screenshots.map((shot) => (
        <div key={shot.title} className="rounded-2xl border border-slate-700 bg-surface/60 p-4">
          <div className="h-48 rounded-xl bg-gradient-to-br from-surface to-midnight flex items-center justify-center text-slate-400">
            {shot.title}
          </div>
          <p className="mt-3 text-slate-200 font-semibold">{shot.title}</p>
          <p className="text-sm text-slate-400">{shot.caption}</p>
        </div>
      ))}
    </section>
  );
}
