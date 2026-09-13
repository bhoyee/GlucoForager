'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const SUBJECT_OPTIONS = [
  { value: '', label: 'Select a topic' },
  { value: 'support', label: 'Technical Support' },
  { value: 'feedback', label: 'Product Feedback' },
  { value: 'partnership', label: 'Partnership Inquiry' },
  { value: 'press', label: 'Press & Media' },
  { value: 'other', label: 'Other' },
];

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  return (
    <div
      className="fixed top-6 right-6 z-[70] w-[calc(100%-3rem)] max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-sm ${
          isSuccess ? 'bg-emerald-50/95 border-emerald-200' : 'bg-red-50/95 border-red-200'
        }`}
      >
        <div
          className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ${
            isSuccess ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          {isSuccess ? (
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${isSuccess ? 'text-emerald-900' : 'text-red-900'}`}>
            {isSuccess ? 'Message sent' : 'Message not sent'}
          </p>
          <p className={`mt-0.5 text-sm ${isSuccess ? 'text-emerald-800' : 'text-red-800'}`}>{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className={`flex-none rounded-lg p-1 ${isSuccess ? 'text-emerald-700 hover:bg-emerald-100' : 'text-red-700 hover:bg-red-100'}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');
const APP_STORE_REVIEW_URL =
  (process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/us/app/glucoforager/id6758808427') +
  '?action=write-review';
const SHARE_TEXT =
  "I've been using GlucoForager to turn what's in my kitchen into diabetes-friendly meal ideas — thought you might find it useful too.";

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
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

  const updateField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setToast(null);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(form),
      });
      clearTimeout(timer);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        setToast({
          type: 'error',
          message: detail || 'Something went wrong sending your message. Please try again.',
        });
        return;
      }

      setToast({ type: 'success', message: "We've received your message and will reply within 24 hours." });
      setForm({ name: '', email: '', subject: '', message: '', website: '' });
    } catch {
      setToast({
        type: 'error',
        message: 'Could not reach the server. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setToast(null), 6000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-white/20">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column: Contact Info */}
          <div>
            <h3 className="text-xl font-bold text-white mb-6">Get in Touch</h3>

            <div className="space-y-5">
              {/* Email */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Email</h4>
                  <p className="text-gray-300 text-sm">hello@glucoforager.com</p>
                  <p className="text-gray-400 text-xs mt-1">Typically responds within 24 hours</p>
                </div>
              </div>

              {/* App Status */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">App Status</h4>
                  <p className="text-gray-300 text-sm">Available Now</p>
                  <p className="text-gray-400 text-xs mt-1">Download from App Store & Google Play</p>
                </div>
              </div>

              {/* Support Hours */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Support Hours</h4>
                  <p className="text-gray-300 text-sm">Mon-Fri, 9AM-6PM GMT</p>
                  <p className="text-gray-400 text-xs mt-1">Weekend responses may be slower</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/20">
              <h4 className="font-medium text-white mb-2">Spread the word</h4>
              <p className="text-gray-300 text-sm">
                Know someone managing diabetes? Send them the app.
              </p>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SITE_URL}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-3 text-white text-xs font-medium transition-colors"
                >
                  <svg className="w-5 h-5 text-emerald-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.58-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12.003 2C6.478 2 2 6.478 2 12.003c0 1.982.55 3.887 1.588 5.535L2 22l4.575-1.55a9.96 9.96 0 0 0 5.428 1.55C17.526 22 22 17.522 22 12.003 22 6.478 17.526 2 12.003 2Zm0 18.16a8.13 8.13 0 0 1-4.146-1.13l-.297-.176-3.06 1.037.86-3.096-.194-.318a8.12 8.12 0 0 1-1.24-4.31 8.16 8.16 0 0 1 16.32 0 8.15 8.15 0 0 1-8.243 8.16Z" />
                  </svg>
                  WhatsApp
                </a>

                <a
                  href={`mailto:?subject=${encodeURIComponent('Try GlucoForager')}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${SITE_URL}`)}`}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-3 text-white text-xs font-medium transition-colors"
                >
                  <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </a>

                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SITE_URL)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-3 text-white text-xs font-medium transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z" />
                  </svg>
                  X
                </a>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-3 text-white text-xs font-medium transition-colors"
                >
                  {linkCopied ? (
                    <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {linkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-gray-300 text-xs">
                  Enjoying GlucoForager? A quick review helps other people managing diabetes find us.
                </p>
                <a
                  href={APP_STORE_REVIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-none inline-flex items-center gap-1 rounded-lg border border-white/20 hover:border-white/40 px-3 py-2 text-white text-xs font-semibold transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 1.5l2.635 5.338 5.89.856-4.263 4.155 1.007 5.871L10 14.847l-5.269 2.873 1.007-5.871L1.475 7.694l5.89-.856L10 1.5z" />
                  </svg>
                  Leave a review
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div>
            <h3 className="text-xl font-bold text-white mb-6">Send us a Message</h3>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Honeypot - hidden from real visitors, catches bots that fill every field */}
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={updateField('website')}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Name Field */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={form.name}
                    onChange={updateField('name')}
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    placeholder="John Doe"
                    required
                  />
                </div>

                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={form.email}
                    onChange={updateField('email')}
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>

              {/* Subject Field */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                  Subject
                </label>
                <select
                  id="subject"
                  value={form.subject}
                  onChange={updateField('subject')}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                >
                  {SUBJECT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.value === ''} className="bg-[#01404F]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message Field (shorter) */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  rows="3"
                  value={form.message}
                  onChange={updateField('message')}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                  placeholder="How can we help you?"
                  required
                ></textarea>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>

              {/* Privacy Note */}
              <p className="text-xs text-gray-400 text-center mt-4">
                By submitting this form, you agree to our Privacy Policy. We'll never share your information.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
