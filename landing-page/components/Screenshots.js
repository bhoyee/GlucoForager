import Image from 'next/image';

export default function Screenshots() {
  const screenshots = [
    { id: 1, alt: "Camera screen", description: "Scan your fridge with AI" },
    { id: 2, alt: "Recipe results", description: "Get 3 diabetes-safe recipes" },
    { id: 3, alt: "Recipe details", description: "Step-by-step cooking instructions" }
  ];
  
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
      {screenshots.map((shot) => (
        <div key={shot.id} className="relative">
          {/* iPhone mockup frame */}
          <div className="relative w-64 h-[550px] bg-gray-900 rounded-[2.5rem] border-[14px] border-gray-900 shadow-xl">
            {/* Screen placeholder */}
            <div className="absolute inset-[7px] bg-gradient-to-br from-teal-50 to-purple-50 rounded-[2rem] overflow-hidden">
              <div className="h-full flex items-center justify-center text-gray-400">
                App Screenshot {shot.id}
              </div>
            </div>
            {/* Notch */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-40 h-6 bg-gray-900 rounded-b-2xl"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">{shot.description}</p>
        </div>
      ))}
    </div>
  );
}