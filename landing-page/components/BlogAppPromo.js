import React from 'react';

const IOS_URL = 'https://apps.apple.com/us/app/glucoforager/id6758808427';
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.glucoforager.app';

// App call-to-action shown inside a blog article, between two sections.
export default function BlogAppPromo() {
  return (
    <aside className="not-prose my-8 overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <img src="/images/logo.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl bg-white" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-200">GlucoForager app</p>
          <h3 className="mt-1 text-xl font-bold leading-snug text-white">Put this into practice, the easy way</h3>
          <p className="mt-2 text-sm leading-6 text-teal-50">
            Snap your fridge for diabetes-friendly recipes with carbs per serving, scan meals and barcodes for an instant
            verdict, and ask GlucoGuide what to eat today. Free to download.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href={IOS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-gray-900 no-underline transition-colors hover:bg-teal-50"
          aria-label="Download GlucoForager on the App Store"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M16.37 12.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5ZM14.2 6.17c.6-.73 1.01-1.75.9-2.77-.87.04-1.93.58-2.55 1.31-.56.65-1.05 1.69-.92 2.69.97.08 1.96-.49 2.57-1.23Z" />
          </svg>
          App Store
        </a>
        <a
          href={ANDROID_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-gray-900 no-underline transition-colors hover:bg-teal-50"
          aria-label="Get GlucoForager on Google Play"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M4.2 2.4c-.3.3-.4.7-.4 1.2v16.8c0 .5.1.9.4 1.2l.1.1 9.4-9.4v-.2L4.3 2.3l-.1.1Zm12.6 12.9-3.1-3.1v-.4l3.1-3.1.1.1 3.7 2.1c1.1.6 1.1 1.6 0 2.2l-3.7 2.1-.1.1Zm.1-.1-3.2-3.2-9.5 9.5c.4.4.9.4 1.6.1l11.1-6.4ZM6.8 2.3c-.7-.4-1.2-.3-1.6.1l9.5 9.5 3.2-3.2L6.8 2.3Z" />
          </svg>
          Google Play
        </a>
      </div>
    </aside>
  );
}
