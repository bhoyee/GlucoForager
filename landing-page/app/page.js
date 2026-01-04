import Header from "../components/Header";
import HeroSection from "../components/HeroSection";
import HowItWorks from "../components/HowItWorks";
import Features from "../components/Features";
import Screenshots from "../components/Screenshots";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import FAQ from "../components/FAQ";
import Footer from "../components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header />
      
      <HeroSection />
      
      {/* HOW IT WORKS - Add ID */}
      <section className="py-16 bg-gray-50" id="how-it-works">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            How It Works in 60 Seconds
          </h2>
          <HowItWorks />
        </div>
      </section>
      
      {/* FEATURES - Add ID (matches href="#features") */}
      <section className="py-16" id="features">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            AI-Powered Diabetes Management
          </h2>
          <Features />
        </div>
      </section>
      
      {/* SCREENSHOTS - Add ID (matches href="#screenshots") */}
      <section className="py-16 bg-gray-50" id="screenshots">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            See It In Action
          </h2>
          <Screenshots />
        </div>
      </section>
      
      {/* PRICING - Already has ID, keep it */}
      <section className="py-16" id="pricing">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Start free, upgrade anytime. Cancel whenever you want.
          </p>
          <Pricing />
        </div>
      </section>
      
      {/* TESTIMONIALS - Add ID if you want to link to it */}
      <section className="py-16 bg-gray-50" id="testimonials">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Loved by People with Diabetes
          </h2>
          <Testimonials />
        </div>
      </section>
      
      {/* FAQ - Add ID (matches href="#faq") */}
      <section className="py-16" id="faq">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <FAQ />
        </div>
      </section>
      
      <Footer />
    </div>
  );
}