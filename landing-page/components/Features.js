export default function Features() {
  const features = [
    {
      icon: "🍽️",
      title: "Diabetes-friendly meal ideas",
      description: "Recipes designed for balanced plates and practical portions you can stick to.",
      color: "from-teal-400 to-emerald-500",
      bgColor: "bg-teal-50",
      shadowColor: "shadow-teal-100/50",
    },
    {
      icon: "📊",
      title: "Per-meal nutrition estimates",
      description: "See calories, carbs, protein, and fibre estimates so you can compare options quickly.",
      color: "from-blue-400 to-cyan-500",
      bgColor: "bg-blue-50",
      shadowColor: "shadow-blue-100/50",
    },
    {
      icon: "🔁",
      title: "Food swaps",
      description: "Get smarter alternatives and portion tips to reduce carb load without losing taste.",
      color: "from-purple-400 to-pink-500",
      bgColor: "bg-purple-50",
      shadowColor: "shadow-purple-100/50",
    },
    {
      icon: "💾",
      title: "Save favourites",
      description: "Keep your best meals in one place and come back to them anytime.",
      color: "from-amber-400 to-orange-500",
      bgColor: "bg-amber-50",
      shadowColor: "shadow-amber-100/50",
    },
    {
      icon: "🗓️",
      title: "Daily Meal Planner (Premium)",
      description: "Generate a full-day plan: breakfast, lunch, dinner, and a snack.",
      color: "from-green-400 to-lime-500",
      bgColor: "bg-green-50",
      shadowColor: "shadow-green-100/50",
    },
    {
      icon: "💡",
      title: "Daily tips & challenges",
      description: "Small daily actions that support better routines over time.",
      color: "from-indigo-400 to-violet-500",
      bgColor: "bg-indigo-50",
      shadowColor: "shadow-indigo-100/50",
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
      {features.map((feature) => (
        <div key={feature.title} className="group relative">
          <div
            className={`absolute inset-0 ${feature.bgColor} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          />

          <div
            className={`relative ${feature.bgColor} border border-white p-6 md:p-8 rounded-2xl shadow-lg ${feature.shadowColor} transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-current/20 group-hover:-translate-y-2`}
          >
            <div className="relative mb-6">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-full opacity-20 blur-md group-hover:blur-lg transition-all duration-300`}
              />
              <div
                className={`relative w-20 h-20 md:w-24 md:h-24 mx-auto rounded-full bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg`}
              >
                <span className="text-4xl md:text-5xl">{feature.icon}</span>
              </div>
              <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white/80 group-hover:bg-white transition-colors" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white/80 group-hover:bg-white transition-colors" />
            </div>

            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center">
              {feature.title}
            </h3>

            <p className="text-gray-600 text-center leading-relaxed group-hover:text-gray-700 transition-colors">
              {feature.description}
            </p>

            <div
              className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 h-1 w-16 bg-gradient-to-r ${feature.color} rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:w-24`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

