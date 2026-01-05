import Header from "../components/Header";
import HeroSection from "../components/HeroSection";
import HowItWorks from "../components/HowItWorks";
import Features from "../components/Features";
import Screenshots from "../components/Screenshots";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import FAQ from "../components/FAQ";
import Footer from "../components/Footer";
import Contact from "../components/Contact";
import ScrollToTop from "../components/ScrollToTop";


export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header />
      
      {/* Add pt-20 to push content down (matches header height) */}
      <div className="pt-5">
      {/* HERO SECTION with background pattern */}
      <section className="hero-background py-20" id="hero">
        <div className="container mx-auto px-4">
          <HeroSection />
        </div>
      </section>

      {/* HOW IT WORKS - Responsive dark section */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-28 bg-[#01404F] text-white" id="how-it-works">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
          <div className="text-center max-w-4xl mx-auto mb-10 sm:mb-12 md:mb-16 lg:mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-teal-300 to-white bg-clip-text text-transparent">
              How It Works in 60 Seconds
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-300 px-2 sm:px-0">
              Transform your fridge contents into diabetes-friendly meals in just 4 simple steps
            </p>
          </div>
          
          <HowItWorks />
          
          {/* Responsive CTA Button */}
          <div className="text-center mt-12 sm:mt-16 md:mt-20 lg:mt-24">
            <a 
              href="#pricing" 
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 sm:px-8 py-3 sm:py-4 text-white font-semibold text-sm sm:text-base hover:from-teal-600 hover:to-emerald-600 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl active:scale-95"
            >
              <span>Start Free Today</span>
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <p className="text-gray-300 mt-3 sm:mt-4 text-xs sm:text-sm">
              No credit card required • 3 free AI scans daily
            </p>
          </div>
        </div>
      </section>
      
      {/* FEATURES - White */}
      <section className="py-16 bg-white" id="features">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            AI-Powered Diabetes Management
          </h2>
          <Features />
        </div>
      </section>
      
      {/* SCREENSHOTS - 01404F color */}
      <section className="py-16 bg-[#01404F] text-white" id="screenshots">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            See It In Action
          </h2>
          <Screenshots />
        </div>
      </section>
      
      {/* PRICING - White */}
    <section className="py-16 bg-white" id="pricing">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-4">
          Simple, Transparent Pricing
        </h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Start free, upgrade anytime. Cancel whenever you want.
        </p>
        
        {/* Add this note */}
        <div className="text-center mb-8 max-w-lg mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Click any plan to download the app & get started</span>
          </div>
        </div>
        
        <Pricing />
      </div>
    </section>
          
      {/* TESTIMONIALS - 01404F color */}
      <section className="py-16 md:py-24 bg-[#01404F] text-white" id="testimonials">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-400/20">
              <svg className="w-4 h-4 text-teal-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-teal-300">Pilot Program Results</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              Real Stories from Our <span className="text-transparent bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text">Pilot Program</span>
            </h2>
            
            <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
              See how participants in our pilot program are transforming their diabetes management with AI-powered cooking
            </p>
          </div>
          
          <Testimonials />
          
          {/* App Store badges - Updated for pre-launch */}
          <div className="text-center mt-12 md:mt-16">
            <div className="inline-flex flex-col sm:flex-row gap-4 justify-center">
              <div className="inline-flex items-center justify-center gap-3 bg-gray-800 text-white rounded-xl px-6 py-4">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 384 512">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
                <div className="text-left">
                  <div className="text-xs opacity-80">Coming Soon to</div>
                  <div className="font-semibold">App Store</div>
                </div>
              </div>
              
              <div className="inline-flex items-center justify-center gap-3 bg-gray-800 text-white rounded-xl px-6 py-4">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 512 512">
                  <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                </svg>
                <div className="text-left">
                  <div className="text-xs opacity-80">COMING SOON TO</div>
                  <div className="font-semibold">Google Play</div>
                </div>
              </div>
            </div>
            
    
          </div>
        </div>
      </section>
      
     
      {/* FAQ - Enhanced section */}
      <section className="py-16 md:py-24 bg-white" id="faq">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-teal-50 border border-teal-100">
              <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-teal-700">Common Questions</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Frequently Asked <span className="text-transparent bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text">Questions</span>
            </h2>
            
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to know about GlucoForager and AI-powered diabetes meal planning
            </p>
          </div>
          
          <FAQ />
        </div>
      </section>
      
      {/* CONTACT - 01404F color */}
 
      <section className="py-12 md:py-16 bg-[#01404F] text-white" id="contact">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Get in <span className="text-transparent bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text">Touch</span>
            </h2>
            <p className="text-gray-300">
              Have questions or feedback? We'd love to hear from you.
            </p>
          </div>
          
          <Contact />
        </div>
      </section>
      
      <Footer />
       <ScrollToTop />
    </div>
    </div>
  );
}