'use client';

import { useState } from 'react';
import Header from './Header';
import HeroSection from './HeroSection';
import HowItWorks from './HowItWorks';
import Features from './Features';
import Testimonials from './Testimonials';
import FAQ from './FAQ';
import LatestBlogPosts from './LatestBlogPosts';
import Footer from './Footer';
import Contact from './Contact';
import ScrollToTop from './ScrollToTop';
import DownloadModal from './DownloadModal';
import NewsletterPopup from './NewsletterPopup';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');
const SHARE_TEXT =
  "I've been using GlucoForager to turn what's in my kitchen into diabetes-friendly meal ideas — thought you might find it useful too.";

export default function HomePageClient({ latestPosts }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing to fall back to */
    }
  };

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
                From fridge to food decision in 3 steps
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-gray-300 px-2 sm:px-0">
                A simple flow for turning what you have into a clearer diabetes-aware choice.
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
            </div>
          </div>
        </section>

        {/* FEATURES - White */}
        <section className="bg-white py-16 md:py-24" id="features">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
            <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800">
                App features
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl md:text-5xl">
                Built for the food decisions people repeat every day
              </h2>
              <p className="mt-5 text-lg leading-8 text-gray-600">
                Scan, ask, swap, plan, save, and reuse meals with practical diabetes-aware guidance in one place.
              </p>
            </div>
            <Features />
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

        {/* SPREAD THE WORD - Standalone full-width block */}
        <section className="py-10 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full rounded-3xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 p-6 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="min-w-0">
                  <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900">
                    Spread the word
                  </h3>
                  <p className="mt-2 text-gray-700">
                    Know someone managing diabetes? Send them GlucoForager.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SITE_URL}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-teal-200 px-5 py-3 text-gray-800 font-semibold text-sm shadow-sm hover:bg-teal-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.58-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12.003 2C6.478 2 2 6.478 2 12.003c0 1.982.55 3.887 1.588 5.535L2 22l4.575-1.55a9.96 9.96 0 0 0 5.428 1.55C17.526 22 22 17.522 22 12.003 22 6.478 17.526 2 12.003 2Zm0 18.16a8.13 8.13 0 0 1-4.146-1.13l-.297-.176-3.06 1.037.86-3.096-.194-.318a8.12 8.12 0 0 1-1.24-4.31 8.16 8.16 0 0 1 16.32 0 8.15 8.15 0 0 1-8.243 8.16Z" />
                    </svg>
                    WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent('Try GlucoForager')}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${SITE_URL}`)}`}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-teal-200 px-5 py-3 text-gray-800 font-semibold text-sm shadow-sm hover:bg-teal-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SITE_URL)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-teal-200 px-5 py-3 text-gray-800 font-semibold text-sm shadow-sm hover:bg-teal-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z" />
                    </svg>
                    X
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-white font-semibold text-sm shadow-sm hover:bg-teal-700 transition-colors"
                  >
                    {linkCopied ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                    {linkCopied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
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
