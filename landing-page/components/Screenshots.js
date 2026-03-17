import Image from 'next/image';

export default function Screenshots() {
  const screenshots = [
    {
      id: 1,
      src: "/screenshots/home-screen.jpeg",
      alt: "Home screen with daily scans, swaps, and meal planner",
      description: "Quick access to scans, swaps, daily tips, and recent recipes",
    },
    {
      id: 2,
      src: "/screenshots/Scan-ingredients-(camera%20view).jpeg",
      alt: "Scan ingredients with camera",
      description: "Scan your fridge and detect ingredients",
    },
    {
      id: 3,
      src: "/screenshots/recipe-result.jpeg",
      alt: "Recipe results list",
      description: "Practical recipes with nutrition context",
    },
    {
      id: 4,
      src: "/screenshots/Recip-detail.jpeg",
      alt: "Recipe details screen",
      description: "Steps, nutrition estimates, and favourites",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {screenshots.map((shot) => (
        <div
          key={shot.id}
          className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl max-w-[220px] sm:max-w-[240px] mx-auto"
        >
          <div className="relative aspect-[9/16]">
            <Image
              src={shot.src}
              alt={shot.alt}
              fill
              sizes="(max-width: 640px) 220px, (max-width: 1024px) 240px, 240px"
              className="object-cover"
            />
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-gray-200">{shot.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

