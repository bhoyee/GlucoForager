export default function Features() {
  const features = [
    {
      icon: "🩺",
      title: "Diabetes-Safe Recipes",
      description: "Every recipe is AI-checked for low glycemic impact and diabetes guidelines",
      color: "from-teal-400 to-emerald-500",
      bgColor: "bg-teal-50",
      shadowColor: "shadow-teal-100/50"
    },
    {
      icon: "📊", 
      title: "Smart Nutrition Tracking",
      description: "Monitor carbs, calories, and glycemic index for every meal",
      color: "from-blue-400 to-cyan-500",
      bgColor: "bg-blue-50",
      shadowColor: "shadow-blue-100/50"
    },
    {
      icon: "⚡",
      title: "AI-Powered Analysis",
      description: "Advanced AI analyzes your fridge and creates personalized recipes",
      color: "from-purple-400 to-pink-500",
      bgColor: "bg-purple-50",
      shadowColor: "shadow-purple-100/50"
    },
    {
      icon: "💾",
      title: "Save & Organize Favorites",
      description: "Premium users can save and organize their safe recipes",
      color: "from-amber-400 to-orange-500",
      bgColor: "bg-amber-50",
      shadowColor: "shadow-amber-100/50"
    },
    {
      icon: "⏰",
      title: "Quick Meal Planning",
      description: "Get recipes ready in under 30 minutes with your ingredients",
      color: "from-green-400 to-lime-500",
      bgColor: "bg-green-50",
      shadowColor: "shadow-green-100/50"
    },
    {
      icon: "🔍",
      title: "Real-Time Processing",
      description: "Photos are processed instantly by AI - no storage, no data saved",
      color: "from-indigo-400 to-violet-500",
      bgColor: "bg-indigo-50",
      shadowColor: "shadow-indigo-100/50"
    }
  ];
  
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
      {features.map((feature, index) => (
        <div 
          key={index} 
          className="group relative"
        >
          {/* Glow effect on hover */}
          <div className={`absolute inset-0 ${feature.bgColor} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
          
          {/* Main card */}
          <div className={`relative ${feature.bgColor} border border-white p-6 md:p-8 rounded-2xl shadow-lg ${feature.shadowColor} transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-current/20 group-hover:-translate-y-2`}>
            
            {/* Large icon with gradient background */}
            <div className="relative mb-6">
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} rounded-full opacity-20 blur-md group-hover:blur-lg transition-all duration-300`}></div>
              <div className={`relative w-20 h-20 md:w-24 md:h-24 mx-auto rounded-full bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg`}>
                <span className="text-4xl md:text-5xl">{feature.icon}</span>
              </div>
              
              {/* Optional: Decorative dots */}
              <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white/80 group-hover:bg-white transition-colors"></div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white/80 group-hover:bg-white transition-colors"></div>
            </div>
            
            {/* Title with gradient text effect */}
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center group-hover:bg-gradient-to-r group-hover:from-gray-900 group-hover:to-gray-700 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
              {feature.title}
            </h3>
            
            {/* Description */}
            <p className="text-gray-600 text-center leading-relaxed group-hover:text-gray-700 transition-colors">
              {feature.description}
            </p>
            
            {/* Bottom accent line */}
            <div className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 h-1 w-16 bg-gradient-to-r ${feature.color} rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:w-24`}></div>
            
            {/* Corner decorative elements */}
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="w-2 h-2 rounded-full bg-current/20"></div>
            </div>
            <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="w-2 h-2 rounded-full bg-current/20"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}