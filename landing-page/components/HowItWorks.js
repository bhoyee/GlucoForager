export default function HowItWorks() {
  const steps = [
    {
      number: "1",
      title: "Scan or Type",
      description: "Scan ingredients with your camera or type what you have",
      icon: "📸",
      color: "from-blue-400 to-teal-400",
      details: "Works with real pantry and fridge items",
    },
    {
      number: "2",
      title: "Choose Your Focus",
      description: "Pick goals like lower carb, quick meals, or higher protein",
      icon: "👉",
      color: "from-purple-400 to-pink-400",
      details: "Personalised guidance from your profile",
    },
    {
      number: "3",
      title: "Get Meal Ideas + Swaps",
      description: "Get recipes, portion tips, and food swaps that fit your meal",
      icon: "🤖",
      color: "from-teal-400 to-emerald-400",
      details: "Practical choices you can cook today",
    },
    {
      number: "4",
      title: "Plan Your Day (Premium)",
      description: "Generate a daily plan for breakfast, lunch, dinner, and snacks",
      icon: "🍳",
      color: "from-amber-400 to-orange-400",
      details: "Simple, repeatable routines",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
        {steps.map((step, index) => (
          <div key={step.number} className="relative">
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-7 lg:p-8 text-center hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
              <div className="relative mx-auto mb-6 sm:mb-7 lg:mb-8">
                <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-full opacity-20 blur-lg`} />
                <div
                  className={`relative w-28 h-28 sm:w-32 sm:h-32 lg:w-36 lg:h-36 mx-auto rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center shadow-2xl shadow-current/20`}
                >
                  <span className="text-5xl sm:text-6xl lg:text-7xl">{step.icon}</span>
                </div>

                <div className="absolute -top-3 -right-3 w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-full bg-white text-gray-900 font-bold flex items-center justify-center shadow-xl">
                  {step.number}
                </div>
              </div>

              <div className="text-xs sm:text-sm font-semibold text-teal-300 mb-3 tracking-wider uppercase">
                Step {step.number}
              </div>

              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-3 sm:mb-4">{step.title}</h3>

              <p className="text-gray-200 text-sm sm:text-base lg:text-lg mb-3 sm:mb-4 leading-relaxed">
                {step.description}
              </p>

              <p className="text-xs sm:text-sm text-gray-300 opacity-80 italic">{step.details}</p>
            </div>

            {index < steps.length - 1 && (
              <div className="hidden xl:block absolute top-1/2 -right-6 transform -translate-y-1/2 text-teal-400/40 pointer-events-none">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            )}

            {index < steps.length - 1 && (
              <div className="md:hidden flex flex-col items-center mt-4 text-teal-400/50">
                <div className="w-0.5 h-6 bg-gradient-to-b from-teal-400/50 to-transparent" />
                <svg className="w-7 h-7 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

