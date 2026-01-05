export default function HowItWorks() {
  const steps = [
    {
      number: "1",
      title: "Snap Your Fridge",
      description: "Take a clear photo of everything in your fridge or pantry",
      icon: "📸",
      color: "from-blue-400 to-teal-400",
      bgColor: "bg-blue-500/10",
      details: "Capture all your available ingredients"
    },
    {
      number: "2",
      title: "Select Ingredients",
      description: "Choose which items you want to use in your recipes",
      icon: "👆",
      color: "from-purple-400 to-pink-400",
      bgColor: "bg-purple-500/10",
      details: "Pick your favorites to use first"
    },
    {
      number: "3",
      title: "AI Analysis",
      description: "AI analyzes ingredients for diabetes safety",
      icon: "🤖",
      color: "from-teal-400 to-emerald-400",
      bgColor: "bg-teal-500/10",
      details: "Checks glycemic index & nutrition"
    },
    {
      number: "4",
      title: "Get 3 Recipes",
      description: "Instantly receive diabetic-friendly recipes",
      icon: "🍳",
      color: "from-amber-400 to-orange-400",
      bgColor: "bg-amber-500/10",
      details: "Complete cooking instructions"
    }
  ];
  
  return (
    <>
      {/* Desktop Layout (lg and up) - FIXED SPACING */}
      <div className="hidden lg:flex justify-between items-start max-w-7xl mx-auto px-8">
        {steps.map((step, index) => (
          <div key={step.number} className="relative flex flex-col items-center w-64 mx-4">
            {/* Step Card with proper spacing */}
            <div className="relative w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] z-10">
              {/* Large Icon Circle */}
              <div className="relative mx-auto mb-8">
                <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-full opacity-20 blur-lg`}></div>
                <div className={`relative w-48 h-48 mx-auto rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center shadow-2xl shadow-current/30`}>
                  <span className="text-8xl">{step.icon}</span>
                </div>
                
                {/* Step number badge */}
                <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white text-gray-900 font-bold text-2xl flex items-center justify-center shadow-2xl">
                  {step.number}
                </div>
              </div>
              
              {/* Content */}
              <div className="text-sm font-semibold text-teal-300 mb-4 tracking-wider uppercase">
                STEP {step.number}
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-6 group-hover:text-teal-200 transition-colors min-h-[3.5rem] flex items-center justify-center">
                {step.title}
              </h3>
              
              <p className="text-gray-200 mb-6 text-lg leading-relaxed min-h-[4.5rem]">
                {step.description}
              </p>
              
              <p className="text-sm text-gray-300 opacity-80 italic">
                {step.details}
              </p>
            </div>
            
            {/* Connecting Arrow (except for last step) - More spacing */}
            {index < steps.length - 1 && (
              <div className="absolute top-1/2 -right-8 transform -translate-y-1/2 z-0">
                <svg 
                  className="w-16 h-auto text-teal-400/40" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth="2" 
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tablet Layout (md to lg) */}
      <div className="hidden md:flex lg:hidden flex-col gap-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 gap-8 px-4">
          {steps.map((step) => (
            <div key={step.number} className="relative">
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-all duration-300">
                {/* Icon */}
                <div className="relative mx-auto mb-6">
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-full opacity-20 blur-md`}></div>
                  <div className={`relative w-36 h-36 mx-auto rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg shadow-current/20`}>
                    <span className="text-7xl">{step.icon}</span>
                  </div>
                  
                  <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-white text-gray-900 font-bold text-lg flex items-center justify-center shadow-lg">
                    {step.number}
                  </div>
                </div>
                
                <div className="text-sm font-semibold text-teal-300 mb-3 tracking-wider uppercase">
                  STEP {step.number}
                </div>
                
                <h3 className="text-xl font-bold text-white mb-4 min-h-[3rem] flex items-center justify-center">
                  {step.title}
                </h3>
                
                <p className="text-gray-200 text-base mb-3 min-h-[3.5rem]">
                  {step.description}
                </p>
                
                <p className="text-xs text-gray-300 opacity-80 italic">
                  {step.details}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Layout (sm and below) */}
      <div className="md:hidden">
        <div className="space-y-10 max-w-md mx-auto px-4">
          {steps.map((step) => (
            <div key={step.number} className="relative">
              {/* Connecting line for mobile */}
              {step.number !== "1" && (
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 w-0.5 h-10 bg-gradient-to-b from-teal-400/50 to-transparent"></div>
              )}
              
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center">
                {/* Icon - Smaller on mobile */}
                <div className="relative mx-auto mb-5">
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-full opacity-20 blur-md`}></div>
                  <div className={`relative w-32 h-32 mx-auto rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg shadow-current/20`}>
                    <span className="text-6xl">{step.icon}</span>
                  </div>
                  
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white text-gray-900 font-bold flex items-center justify-center shadow-lg">
                    {step.number}
                  </div>
                </div>
                
                <div className="text-xs font-semibold text-teal-300 mb-3 tracking-wider uppercase">
                  STEP {step.number}
                </div>
                
                <h3 className="text-lg font-bold text-white mb-3">
                  {step.title}
                </h3>
                
                <p className="text-gray-200 text-sm mb-3">
                  {step.description}
                </p>
                
                <p className="text-xs text-gray-300 opacity-80 italic">
                  {step.details}
                </p>
              </div>
              
              {/* Down arrow indicator for all but last step */}
              {step.number !== "4" && (
                <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 text-teal-400/50">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}