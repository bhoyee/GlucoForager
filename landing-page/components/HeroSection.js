"use client";

export default function HeroSection({ onDownloadClick }) {
  return (
    <section className="container mx-auto px-4 py-4 md:py-10 relative overflow-hidden bg-gradient-to-br from-white via-teal-50/30 to-purple-50/20">
      {/* Subtle premium gradient mesh backdrop */}
      <div className="absolute inset-0 z-0 hero-pattern" aria-hidden="true"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Your <span className="text-teal-600">Daily Diabetes</span> Food Assistant
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto lg:mx-0">
              Turn what you already have into practical diabetes-aware meal ideas, smarter swaps, and a daily plan that feels easier to follow.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-10 max-w-2xl mx-auto lg:mx-0">
              <div className="group rounded-2xl bg-gradient-to-br from-white/95 to-teal-50/60 backdrop-blur border border-teal-100/80 px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-200/30">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 shadow-sm" />
                  <p className="text-sm font-extrabold text-gray-900 leading-snug">
                    Scan What You Have, Eat What Works
                  </p>
                </div>
              </div>
              <div className="group rounded-2xl bg-gradient-to-br from-white/95 to-teal-50/60 backdrop-blur border border-teal-100/80 px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-200/30">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 shadow-sm" />
                  <p className="text-sm font-extrabold text-gray-900 leading-snug">
                    A Daily Plan Built for Blood Sugar
                  </p>
                </div>
              </div>
              <div className="group rounded-2xl bg-gradient-to-br from-white/95 to-teal-50/60 backdrop-blur border border-teal-100/80 px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-200/30">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 shadow-sm" />
                  <p className="text-sm font-extrabold text-gray-900 leading-snug">
                    Smarter Swaps, Better Choices
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-10">
              <button
                type="button"
                onClick={onDownloadClick}
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-black px-8 py-4 text-white hover:bg-gray-800 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl z-10"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 384 512">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
                <div className="text-left">
                  <div className="text-xs opacity-80">Download on the</div>
                  <div className="font-semibold text-lg">App Store</div>
                </div>
              </button>
              
              <button
                type="button"
                onClick={onDownloadClick}
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-black px-8 py-4 text-white hover:bg-gray-800 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl z-10"
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 512 512">
                  <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                </svg>
                <div className="text-left">
                  <div className="text-xs opacity-80">GET IT ON</div>
                  <div className="font-semibold text-lg">Google Play</div>
                </div>
              </button>
            </div>
            
            <div className="text-gray-500 text-sm bg-white/80 backdrop-blur-sm rounded-lg py-3 px-6 inline-block border border-white/20 shadow-lg z-10">
              Start free - no credit card required. Premium unlocks the Daily Meal Planner and higher usage limits.
            </div>
          </div>

          <div className="flex justify-center lg:justify-end lg:pr-6 xl:pr-10 -mt-10">
            <div className="relative w-[220px] sm:w-[260px] md:w-[300px] lg:w-[340px] h-[470px] sm:h-[520px] md:h-[580px] lg:h-[640px] transform-gpu transition-transform duration-300">
              <div className="absolute inset-0 rounded-[2.5rem] bg-white shadow-2xl ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-2 hover:shadow-emerald-200/40"></div>
              <div className="absolute inset-3 rounded-[2rem] overflow-hidden bg-white ring-1 ring-black/5">
                <video
                  className="h-full w-full object-cover object-center"
                  src="/videos/app-demo.mp4"
                  poster="/screenshots/home-screenshot.png"
                  preload="metadata"
                  muted
                  playsInline
                  loop
                  autoPlay
                  controls
                />
              </div>

              {/* Premium badge chips */}
              <div className="absolute -left-4 top-10 hidden sm:flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur border border-teal-100 px-4 py-2.5 shadow-lg shadow-teal-900/10">
                <span className="flex h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" />
                <span className="text-xs font-bold text-gray-800">AI-powered</span>
              </div>
              <div className="absolute -right-4 bottom-16 hidden sm:flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur border border-teal-100 px-4 py-2.5 shadow-lg shadow-teal-900/10">
                <span className="flex h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" />
                <span className="text-xs font-bold text-gray-800">Free to start</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
