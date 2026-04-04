import React from 'react';

export const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbC5ghU6GcGBY7FOni0n';

export default function WhatsAppCtaCard({
  title = 'Daily Diabetes Hacks',
  description = 'Join our WhatsApp Channel for quick tips, meal ideas, and low-glycemic swaps.',
  cta = 'Join the GlucoForager WhatsApp Channel',
  className = '',
} = {}) {
  return (
    <aside className={`rounded-2xl border border-teal-100 bg-white p-6 shadow-sm ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M20.52 3.48A11.94 11.94 0 0 0 12.02 0C5.44 0 .1 5.33.1 11.9c0 2.09.55 4.13 1.6 5.93L0 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45h.01c6.58 0 11.92-5.33 11.92-11.9 0-3.18-1.24-6.17-3.41-8.42zM12 21.8h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.87 9.87 0 0 1-1.52-5.26C2.1 6.44 6.55 2 12.02 2a9.9 9.9 0 0 1 7.03 2.92 9.86 9.86 0 0 1 2.92 7c0 5.46-4.45 9.88-9.97 9.88zm5.74-7.38c-.31-.16-1.85-.92-2.14-1.02-.29-.11-.5-.16-.71.16-.2.31-.82 1.02-1 1.23-.18.2-.36.23-.67.08-.31-.16-1.3-.48-2.47-1.52-.91-.81-1.52-1.81-1.7-2.11-.18-.31-.02-.47.14-.63.14-.14.31-.36.47-.53.16-.18.2-.31.31-.51.1-.2.05-.39-.02-.55-.08-.16-.71-1.72-.97-2.36-.26-.62-.52-.54-.71-.55h-.6c-.2 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.62 0 1.54 1.12 3.03 1.28 3.24.16.2 2.2 3.36 5.32 4.71.74.32 1.32.51 1.77.66.74.24 1.42.21 1.96.13.6-.09 1.85-.76 2.11-1.49.26-.74.26-1.37.18-1.5-.08-.13-.29-.2-.6-.36z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
      </div>

      <a
        href={WHATSAPP_CHANNEL_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
      >
        <span>{cta}</span>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>

      <p className="mt-3 text-xs text-gray-500">You can leave anytime. We don’t spam.</p>
    </aside>
  );
}
