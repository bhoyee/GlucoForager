const screenshots = [
  { title: 'Ingredient scan', caption: 'Scan ingredients or type what you have.' },
  { title: 'Recipe results', caption: 'Get practical meal ideas with nutrition context.' },
  { title: 'Meal planner', caption: 'Premium daily plan: breakfast, lunch, dinner and snack.' },
];

export default function ScreenshotGallery() {
  return (
    <section id="gallery" className="grid gap-4 md:grid-cols-3">
      {screenshots.map((shot) => (
        <div key={shot.title} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="h-48 rounded-xl bg-gradient-to-br from-gray-50 to-white flex items-center justify-center text-gray-400">
            {shot.title}
          </div>
          <p className="mt-3 text-gray-900 font-semibold">{shot.title}</p>
          <p className="text-sm text-gray-600">{shot.caption}</p>
        </div>
      ))}
    </section>
  );
}

