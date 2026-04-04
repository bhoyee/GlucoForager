import React from 'react';

const IOS_URL = 'https://apps.apple.com/us/app/glucoforager/id6758808427';
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.glucoforager.app';

export default function AppDownloadCard({ className = '' } = {}) {
  return (
    <aside className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`.trim()}>
      <h3 className="text-lg font-bold text-gray-900">Get the app</h3>
      <p className="mt-1 text-sm text-gray-600">
        Download GlucoForager on iOS or Android.
      </p>

      <div className="mt-5 space-y-3">
        <a
          href={IOS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white font-semibold hover:bg-black transition-colors"
          aria-label="Open Apple App Store listing"
        >
          <span className="text-sm">Download on App Store</span>
        </a>

        <a
          href={ANDROID_URL}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white font-semibold hover:bg-black transition-colors"
          aria-label="Open Google Play Store listing"
        >
          <span className="text-sm">Get it on Google Play</span>
        </a>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Tip: After installing, open the app to start scanning ingredients.
      </p>
    </aside>
  );
}

