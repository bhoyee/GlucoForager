'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbC5ghU6GcGBY7FOni0n';

export default function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const pathname = usePathname();
  const homeSectionHref = (hash) => (pathname === '/' ? hash : `/${hash}`);

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();
    if (newsletterBusy) return;

    const email = newsletterEmail.trim();
    if (!email) return;

    setNewsletterBusy(true);
    setNewsletterMessage('');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(`${API_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ email, source: 'footer', website: '' }),
      });
      clearTimeout(timer);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        if (response.status === 429) {
          setNewsletterMessage(detail || 'Too many requests. Please wait a minute and try again.');
          return;
        }
        setNewsletterMessage(detail || 'Could not subscribe right now. Please try again.');
        return;
      }
      setNewsletterEmail('');
      setNewsletterMessage(data?.already ? 'You’re already subscribed.' : 'Subscribed! Check your inbox for updates.');
    } catch {
      setNewsletterMessage('Could not subscribe right now. Please try again.');
    } finally {
      setNewsletterBusy(false);
    }
  };

  return (
    <footer className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-10 w-10">
                                        <Image 
                                          src="/images/logo.png" 
                                          alt="GlucoForager Logo" 
                                          width={40}
                                          height={40}
                                          className="object-contain"
                                          priority
                                        />
                                      </div>
              <span className="text-2xl font-bold">GlucoForager</span>
            </div>
            <p className="text-gray-400 mb-6 max-w-md">
              AI-powered meal ideas for steadier blood sugar habits. Scan ingredients, get recipes and swaps, and plan your day with Premium.
            </p>
            
            {/* Social Media Icons */}
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">Follow us:</span>
              <div className="flex gap-3">
                {/* Facebook */}
                <a href="https://www.facebook.com/people/GlucoForager/61576505854224/" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors" aria-label="Facebook">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>

                {/* X (Twitter) */}
                <a href="https://x.com/glucoforager" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors" aria-label="X (Twitter)">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>

                {/* Bluesky */}
                <a href="https://bsky.app/profile/glucoforager.bsky.social" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors" aria-label="Bluesky">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .688.378 5.634.624 6.461.816 2.75 3.719 3.682 6.393 3.35.139-.02.278-.04.416-.06-.138.02-.277.04-.416.06-3.865.57-7.297 2.02-2.793 7.13 4.942 5.48 6.78-1.174 7.776-4.647.997 3.473 2.045 9.9 7.76 4.647 4.23-4.647 1.148-6.56-2.717-7.13a13.03 13.03 0 0 1-.416-.06c.138.02.277.04.416.06 2.674.332 5.577-.6 6.393-3.35.246-.827.624-5.773.624-6.461 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.747 13.087 8.686 12 10.8z"/>
                  </svg>
                </a>

                {/* WhatsApp */}
                <a
                  href={WHATSAPP_CHANNEL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors"
                  aria-label="WhatsApp Channel"
                  title="Join our WhatsApp Channel"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.52 3.48A11.94 11.94 0 0 0 12.02 0C5.44 0 .1 5.33.1 11.9c0 2.09.55 4.13 1.6 5.93L0 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45h.01c6.58 0 11.92-5.33 11.92-11.9 0-3.18-1.24-6.17-3.41-8.42zM12 21.8h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.87 9.87 0 0 1-1.52-5.26C2.1 6.44 6.55 2 12.02 2a9.9 9.9 0 0 1 7.03 2.92 9.86 9.86 0 0 1 2.92 7c0 5.46-4.45 9.88-9.97 9.88zm5.74-7.38c-.31-.16-1.85-.92-2.14-1.02-.29-.11-.5-.16-.71.16-.2.31-.82 1.02-1 1.23-.18.2-.36.23-.67.08-.31-.16-1.3-.48-2.47-1.52-.91-.81-1.52-1.81-1.7-2.11-.18-.31-.02-.47.14-.63.14-.14.31-.36.47-.53.16-.18.2-.31.31-.51.1-.2.05-.39-.02-.55-.08-.16-.71-1.72-.97-2.36-.26-.62-.52-.54-.71-.55h-.6c-.2 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62 0 1.54 1.12 3.03 1.28 3.24.16.2 2.2 3.36 5.32 4.71.74.32 1.32.51 1.77.66.74.24 1.42.21 1.96.13.6-.09 1.85-.76 2.11-1.49.26-.74.26-1.37.18-1.5-.08-.13-.29-.2-.6-.36z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a href="https://www.instagram.com/glucoforager/" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors" aria-label="Instagram">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>

                {/* TikTok */}
                <a href="https://www.tiktok.com/@glucoforager" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-gray-800 hover:bg-teal-600 flex items-center justify-center transition-colors" aria-label="TikTok">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          
          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-white">Product</h4>
            <ul className="space-y-3">
              <li><a href={homeSectionHref('#features')} className="text-gray-400 hover:text-teal-400 transition-colors">Features</a></li>
              <li><Link href="/careers" className="text-gray-400 hover:text-teal-400 transition-colors">Careers</Link></li>
              <li><Link href="/blog" className="text-gray-400 hover:text-teal-400 transition-colors">Blog</Link></li>
              <li><Link href="/download" className="text-gray-400 hover:text-teal-400 transition-colors">Download</Link></li>
            </ul>
          </div>
          
          {/* Support Links */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-white">Support</h4>
            <ul className="space-y-3">
              <li><a href={homeSectionHref('#faq')} className="text-gray-400 hover:text-teal-400 transition-colors">FAQ</a></li>
              <li><a href={homeSectionHref('#contact')} className="text-gray-400 hover:text-teal-400 transition-colors">Contact Us</a></li>
              <li><a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-teal-400 transition-colors">Join the GlucoForager WhatsApp Channel</a></li>
              <li><a href="/privacy-policy" className="text-gray-400 hover:text-teal-400 transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="text-gray-400 hover:text-teal-400 transition-colors">Terms & Conditions</a></li>
            </ul>
          </div>
          
          {/* Newsletter Form - Responsive */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-white">Stay Updated</h4>
            <p className="text-gray-400 mb-4 text-sm">
              Get diabetes cooking tips, app updates, and health insights delivered to your inbox.
            </p>
            
            <form className="space-y-3" onSubmit={handleNewsletterSubmit}>
              <div>
                <label htmlFor="footer-email" className="sr-only">Email address</label>
                <input 
                  type="email" 
                  id="footer-email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  placeholder="Your email address" 
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                />
              </div>
              
              <button 
                type="submit"
                disabled={newsletterBusy}
                className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 px-4 py-3 rounded-lg font-semibold transition-all duration-200 transform hover:-translate-y-0.5"
              >
                {newsletterBusy ? 'Subscribing…' : 'Subscribe'}
              </button>
              
              <p className="text-gray-500 text-xs mt-2">
                By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.
              </p>
              {newsletterMessage ? (
                <p className="text-gray-300 text-xs">
                  {newsletterMessage}
                </p>
              ) : null}
            </form>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-500 text-sm">
              <p>© {new Date().getFullYear()} GlucoForager. All rights reserved.</p>
              <p className="mt-1">Made with ❤️ for diabetes health worldwide.</p>
            </div>
            
            <div className="flex flex-wrap gap-4 text-sm">
              <a href="/privacy-policy" className="text-gray-500 hover:text-white transition-colors">Privacy Policy</a>
              <span className="text-gray-600">•</span>
              <a href="/terms" className="text-gray-500 hover:text-white transition-colors">Terms & Conditions</a>
              <span className="text-gray-600">•</span>
              <a href="/cookie-policy" className="text-gray-500 hover:text-white transition-colors">Cookie Policy</a>
              <span className="text-gray-600">•</span>
              <a href="/sitemap" className="text-gray-500 hover:text-white transition-colors">Sitemap</a>
              <span className="text-gray-600">•</span>
              <Link href="/blog" className="text-gray-500 hover:text-white transition-colors">Blog</Link>
              <span className="text-gray-600">•</span>
              <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white transition-colors">WhatsApp Channel</a>
            </div>
          </div>
          
          <div className="mt-6 text-center text-gray-600 text-sm">
            <p>⚠️ Important: GlucoForager provides AI-generated recipe suggestions for informational purposes only. 
            It is not a medical device and does not provide medical advice, diagnosis, or treatment. 
            Always consult with qualified healthcare professionals for personalized medical guidance.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
