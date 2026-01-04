export default function HeroSection() {
  return (
    <section className="container mx-auto px-4 py-20 md:py-32">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
          Diabetes-Friendly Recipes From Your Fridge in <span className="text-teal-600">60 Seconds</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Snap a photo of your fridge → AI analyzes ingredients → Get 3 safe, diabetes-friendly recipes instantly.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a 
            href="#" 
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-4 text-white hover:bg-gray-800 transition-colors"
          >
            <div className="h-6 w-6 bg-white rounded"></div>
            <div className="text-left">
              <div className="text-xs">Download on the</div>
              <div className="font-semibold">App Store</div>
            </div>
          </a>
          <a 
            href="#" 
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-4 text-white hover:bg-gray-800 transition-colors"
          >
            <div className="h-6 w-6 bg-white rounded"></div>
            <div className="text-left">
              <div className="text-xs">Get it on</div>
              <div className="font-semibold">Google Play</div>
            </div>
          </a>
        </div>
        
        <div className="text-gray-500 text-sm">
          Start with 3 free AI scans daily • No credit card required
        </div>
      </div>
    </section>
  );
}