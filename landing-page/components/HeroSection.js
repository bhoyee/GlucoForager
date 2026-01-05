"use client";

export default function HeroSection() {
  return (
    <section className="container mx-auto px-4 py-5 md:py-32 relative overflow-hidden bg-gradient-to-br from-white via-teal-50/30 to-purple-50/20">
      {/* Scattered Food Images Background - BRIGHTER */}
      <div className="absolute inset-0 z-0 opacity-30">
        {/* Top Left - Salad */}
        <div className="absolute top-10 left-10 w-32 h-32 md:w-40 md:h-40 animate-float-slow">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-emerald-400 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-emerald-300 rounded-full shadow-lg shadow-emerald-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-3xl md:text-4xl font-bold">
              🥗
            </div>
          </div>
        </div>

        {/* Top Right - Avocado */}
        <div className="absolute top-20 right-20 w-28 h-28 md:w-36 md:h-36 animate-float">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-green-500 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-green-400 rounded-full shadow-lg shadow-green-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl md:text-3xl font-bold">
              🥑
            </div>
          </div>
        </div>

        {/* Middle Left - Fish */}
        <div className="absolute top-1/2 left-20 w-36 h-36 md:w-44 md:h-44 animate-float-slow">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-blue-500 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-blue-400 rounded-full shadow-lg shadow-blue-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-3xl md:text-4xl font-bold">
              🐟
            </div>
          </div>
        </div>

        {/* Middle Right - Berries */}
        <div className="absolute top-1/3 right-32 w-40 h-40 md:w-48 md:h-48 animate-float-delayed">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-purple-500 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-purple-400 rounded-full shadow-lg shadow-purple-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-3xl md:text-4xl font-bold">
              🫐
            </div>
          </div>
        </div>

        {/* Bottom Left - Broccoli */}
        <div className="absolute bottom-20 left-32 w-28 h-28 md:w-36 md:h-36 animate-float">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-emerald-600 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-emerald-500 rounded-full shadow-lg shadow-emerald-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl md:text-3xl font-bold">
              🥦
            </div>
          </div>
        </div>

        {/* Bottom Right - Chicken */}
        <div className="absolute bottom-32 right-10 w-32 h-32 md:w-40 md:h-40 animate-float-slow">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-amber-600 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-amber-500 rounded-full shadow-lg shadow-amber-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl md:text-3xl font-bold">
              🍗
            </div>
          </div>
        </div>

        {/* Center Top - Apple */}
        <div className="absolute top-40 left-1/2 transform -translate-x-1/2 w-24 h-24 md:w-32 md:h-32 animate-float-delayed">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-red-500 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-red-400 rounded-full shadow-lg shadow-red-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl md:text-3xl font-bold">
              🍎
            </div>
          </div>
        </div>

        {/* Center Bottom - Nuts */}
        <div className="absolute bottom-40 left-1/2 transform -translate-x-1/2 w-28 h-28 md:w-36 md:h-36 animate-float">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-yellow-700 rounded-full opacity-60 blur-lg"></div>
            <div className="absolute inset-4 bg-yellow-600 rounded-full shadow-lg shadow-yellow-200/50"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl md:text-3xl font-bold">
              🌰
            </div>
          </div>
        </div>
      </div>

      {/* Additional BRIGHT food icons scattered */}
      <div className="absolute inset-0 z-0 opacity-40">
        {[
          {emoji: '🥒', color: 'bg-green-400', size: 'text-2xl', top: '15%', left: '5%'},
          {emoji: '🥕', color: 'bg-orange-400', size: 'text-2xl', top: '25%', left: '85%'},
          {emoji: '🍅', color: 'bg-red-400', size: 'text-2xl', top: '70%', left: '10%'},
          {emoji: '🫑', color: 'bg-green-500', size: 'text-2xl', top: '80%', left: '80%'},
          {emoji: '🥬', color: 'bg-emerald-400', size: 'text-2xl', top: '10%', left: '40%'},
          {emoji: '🍓', color: 'bg-red-300', size: 'text-2xl', top: '85%', left: '40%'},
          {emoji: '🥝', color: 'bg-green-300', size: 'text-2xl', top: '30%', left: '60%'},
          {emoji: '🥭', color: 'bg-yellow-500', size: 'text-2xl', top: '60%', left: '90%'},
          {emoji: '🍠', color: 'bg-orange-300', size: 'text-2xl', top: '90%', left: '60%'},
          {emoji: '🥚', color: 'bg-amber-100', size: 'text-2xl', top: '20%', left: '30%'},
          {emoji: '🧀', color: 'bg-yellow-300', size: 'text-2xl', top: '75%', left: '20%'},
          {emoji: '🥛', color: 'bg-blue-100', size: 'text-2xl', top: '40%', left: '15%'},
        ].map((item, index) => (
          <div 
            key={index}
            className={`absolute ${item.size} ${item.color} rounded-full p-2 shadow-lg animate-float-random`}
            style={{
              top: item.top,
              left: item.left,
              animationDelay: `${index * 0.5}s`,
            }}
          >
            {item.emoji}
          </div>
        ))}
      </div>
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
          Diabetes-Friendly Recipes From Your Fridge in <span className="text-teal-600">60 Seconds</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Snap a photo of your fridge → AI analyzes ingredients → Get 3 safe, diabetes-friendly recipes instantly.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a 
            href="#" 
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-black px-8 py-4 text-white hover:bg-gray-800 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl z-10"
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 384 512">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-80">Download on the</div>
              <div className="font-semibold text-lg">App Store</div>
            </div>
          </a>
          
          <a 
            href="#" 
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-black px-8 py-4 text-white hover:bg-gray-800 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl z-10"
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 512 512">
              <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-80">GET IT ON</div>
              <div className="font-semibold text-lg">Google Play</div>
            </div>
          </a>
        </div>
        
        <div className="text-gray-500 text-sm bg-white/80 backdrop-blur-sm rounded-lg py-3 px-6 inline-block border border-white/20 shadow-lg z-10">
          Start with 3 free AI scans daily • No credit card required
        </div>
      </div>
    </section>
  );
}