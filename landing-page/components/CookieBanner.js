'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'gf_cookie_consent_v1';
const COOKIE_NAME = 'gf_cookie_consent';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeConsent(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function setConsentCookie(choice) {
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(choice)}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export default function CookieBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const hidden = useMemo(() => String(pathname || '').startsWith('/admin'), [pathname]);

  useEffect(() => {
    if (hidden) return;
    const consent = readConsent();
    if (!consent?.choice) setOpen(true);
  }, [hidden]);

  const decide = (choice) => {
    const value = { choice, decidedAt: Date.now() };
    writeConsent(value);
    setConsentCookie(choice);
    setOpen(false);
  };

  if (!open || hidden) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-4 sm:p-5">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900">Cookies</p>
            <p className="text-sm text-gray-600">
              We use cookies to improve your experience. You can accept or reject non-essential cookies.{' '}
              <Link href="/cookie-policy" className="text-teal-700 font-semibold hover:text-teal-900">
                Learn more
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              onClick={() => decide('rejected')}
            >
              Reject
            </button>
            <button
              type="button"
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
              onClick={() => decide('accepted')}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

