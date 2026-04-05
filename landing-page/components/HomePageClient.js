'use client';

import { useState } from 'react';
import Header from './Header';
import HeroSection from './HeroSection';
import HowItWorks from './HowItWorks';
import Features from './Features';
import Screenshots from './Screenshots';
import Testimonials from './Testimonials';
import FAQ from './FAQ';
import LatestBlogPosts from './LatestBlogPosts';
import Footer from './Footer';
import Contact from './Contact';
import ScrollToTop from './ScrollToTop';
import DownloadModal from './DownloadModal';
import NewsletterPopup from './NewsletterPopup';

export default function HomePageClient({ latestPosts }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbC5ghU6GcGBY7FOni0n';
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <NewsletterPopup />
      <Header onDownloadClick={() => setShowDownloadModal(true)} />

      {/* Push content below the fixed header (h-20) */}
      <div className="pt-20">
        {/* HERO SECTION with background pattern */}
        <section className="hero-background py-20" id="hero">
          <div className="container mx-auto px-4">
            <HeroSection onDownloadClick={() => setShowDownloadModal(true)} />
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
              <button
                onClick={() => setShowDownloadModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 sm:px-8 py-3 sm:py-4 text-white font-semibold text-sm sm:text-base hover:from-teal-600 hover:to-emerald-600 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl active:scale-95"
              >
                <span>Start Free Today</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <p className="text-gray-300 mt-3 sm:mt-4 text-xs sm:text-sm">No credit card required • 3 free AI scans daily</p>
            </div>
          </div>
        </section>

        {/* FEATURES - White */}
        <section className="py-16 bg-white" id="features">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">What you can do with GlucoForager</h2>
            <Features />
          </div>
        </section>

        {/* SCREENSHOTS - 01404F color */}
        <section className="py-16 bg-[#01404F] text-white" id="screenshots">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">See It In Action</h2>
            <Screenshots />
          </div>
        </section>

        {/* TESTIMONIALS - 01404F color */}
        <section className="py-16 md:py-24 bg-[#01404F] text-white" id="testimonials">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-400/20">
                <svg className="w-4 h-4 text-teal-300" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-teal-300">Pilot Program Results</span>
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
                Real Stories from Our{' '}
                <span className="text-transparent bg-gradient-to-r from-teal-300 to-white bg-clip-text">Community</span>
              </h2>

              <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
                See how participants in our pilot program are transforming their diabetes management with AI-powered cooking
              </p>
            </div>

            <Testimonials />
          </div>
        </section>

        {/* FAQ - Enhanced section */}
        <section className="py-16 md:py-24 bg-white" id="faq">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-teal-50 border border-teal-100">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-medium text-teal-700">Common Questions</span>
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Frequently Asked{' '}
                <span className="text-transparent bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text">Questions</span>
              </h2>

              <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
                Everything you need to know about GlucoForager and AI-powered diabetes meal planning
              </p>
            </div>

            <FAQ />
          </div>
        </section>

        {/* WHATSAPP CTA - Standalone full-width block */}
        <section className="py-10 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full rounded-3xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 p-6 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="min-w-0">
                  <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900">
                    Join the GlucoForager WhatsApp Channel
                  </h3>
                  <p className="mt-2 text-gray-700">
                    Get daily diabetes hacks, meal ideas, and low-glycemic swaps.
                  </p>
                </div>
                <a
                  href={WHATSAPP_CHANNEL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-2xl bg-teal-600 px-7 py-4 text-white font-semibold shadow-sm hover:bg-teal-700 transition-colors"
                >
                  Join the GlucoForager WhatsApp Channel
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>

        <LatestBlogPosts initialItems={Array.isArray(latestPosts) ? latestPosts : []} />

        {/* CONTACT - 01404F color */}
        <section className="py-12 md:py-16 bg-[#01404F] text-white" id="contact">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Get in{' '}
                <span className="text-transparent bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text">Touch</span>
              </h2>
              <p className="text-gray-300">Have questions or feedback? We'd love to hear from you.</p>
            </div>

            <Contact />
          </div>
        </section>

        <Footer />
        <ScrollToTop />
        <DownloadModal open={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
      </div>
    </div>
  );
}
