'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const STORAGE_KEY = 'gf_newsletter_popup_state_v1';
const COOLDOWN_DAYS = 7;
const SCROLL_THRESHOLD = 0.5;

function nowMs() {
  return Date.now();
}

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function NewsletterPopup() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const dialogRef = useRef(null);
  const emailRef = useRef(null);

  const canSubmit = useMemo(() => {
    return !busy && email.trim().length >= 5 && email.includes('@');
  }, [busy, email]);

  useEffect(() => {
    // Show after the visitor has engaged (scrolled), unless dismissed recently or already subscribed.
    const state = readState();
    const dismissedAt = state?.dismissedAt ? Number(state.dismissedAt) : 0;
    const subscribedAt = state?.subscribedAt ? Number(state.subscribedAt) : 0;
    const last = Math.max(dismissedAt, subscribedAt);
    if (last && nowMs() - last < daysToMs(COOLDOWN_DAYS)) return undefined;

    let opened = false;

    const maybeOpen = () => {
      if (opened) return;
      opened = true;
      setOpen(true);
    };

    const getScrollProgress = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const scrollHeight = doc.scrollHeight || 0;
      const clientHeight = doc.clientHeight || 0;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      return scrollTop / maxScroll;
    };

    const onScroll = () => {
      if (getScrollProgress() >= SCROLL_THRESHOLD) {
        maybeOpen();
      }
    };

    const attachTimer = setTimeout(() => {
      try {
        const doc = document.documentElement;
        const maxScroll = Math.max(0, (doc.scrollHeight || 0) - (doc.clientHeight || 0));
        if (maxScroll === 0) {
          const shortTimer = setTimeout(maybeOpen, 6000);
          return () => clearTimeout(shortTimer);
        }
      } catch {
        // Ignore.
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener('scroll', onScroll);
    }, 2500);

    const maxWaitTimer = setTimeout(() => {
      maybeOpen();
    }, 20000);

    return () => {
      clearTimeout(attachTimer);
      clearTimeout(maxWaitTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        dismiss('dismissed');
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Focus email for accessibility.
    const focusTimer = setTimeout(() => emailRef.current?.focus?.(), 50);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = (reason) => {
    writeState({ dismissedAt: nowMs(), reason });
    setOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'homepage_popup', website: '' }),
      });

      if (!response.ok) throw new Error('Request failed');
      const data = await response.json().catch(() => ({}));

      writeState({ subscribedAt: nowMs() });
      setMessage(data?.already ? 'You’re already subscribed.' : 'Thanks! You’re subscribed for blog updates.');
      setEmail('');
      setTimeout(() => setOpen(false), 900);
    } catch {
      setMessage('Could not subscribe right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss('backdrop');
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Newsletter signup"
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                Blog updates
              </p>
              <h3 className="mt-3 text-2xl font-extrabold text-gray-900">
                Get new diabetes-friendly tips in your inbox
              </h3>
              <p className="mt-2 text-gray-600">
                Subscribe for the latest blog posts, product updates, and practical meal ideas.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              onClick={() => dismiss('close')}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="sr-only" htmlFor="newsletter-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            />

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-teal-600 px-5 py-3 text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {busy ? 'Subscribing…' : 'Subscribe'}
            </button>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                className="text-sm font-semibold text-gray-600 hover:text-gray-900"
                onClick={() => dismiss('no_thanks')}
              >
                No thanks
              </button>
              <p className="text-xs text-gray-500">
                By subscribing, you agree to our{' '}
                <Link href="/privacy-policy" className="text-teal-700 font-semibold hover:text-teal-900">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>

            {message ? <p className="text-sm text-gray-600">{message}</p> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
