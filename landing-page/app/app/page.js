"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import ScrollToTop from "../../components/ScrollToTop";
import DownloadModal from "../../components/DownloadModal";

export default function AppDownloadPage() {
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const links = useMemo(
    () => ({
      ios: "https://apps.apple.com/us/app/glucoforager/id6758808427",
      android: "https://play.google.com/store/apps/details?id=com.glucoforager.app",
    }),
    []
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header onDownloadClick={() => setShowDownloadModal(true)} />

      <div className="pt-20">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
          </div>

          <div className="container mx-auto px-4 py-14 sm:py-18 md:py-22">
            <div className="max-w-3xl mx-auto text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-4 py-2 text-sm text-teal-700">
                Download the app
              </p>
              <h1 className="mt-5 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
                Get GlucoForager on your phone
              </h1>
              <p className="mt-5 text-base sm:text-lg text-gray-600">
                Turn what you have in your fridge or pantry into diabetes-friendly meal ideas in seconds.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href={links.ios}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 text-white font-semibold shadow-sm hover:bg-gray-900 transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 384 512" aria-hidden="true">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                  </svg>
                  <span>Download on App Store</span>
                </a>

                <a
                  href={links.android}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 rounded-xl bg-gray-900 px-6 py-4 text-white font-semibold shadow-sm hover:bg-black transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
                    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
                  </svg>
                  <span>Get it on Google Play</span>
                </a>
              </div>

              <p className="mt-4 text-sm text-gray-500">
                Tip: if a link opens the browser, tap “Open in App Store / Play Store”.
              </p>
            </div>
          </div>
        </section>

        {/* QR codes */}
        <section className="py-14 sm:py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                <div className="max-w-xl">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Scan to download</h2>
                  <p className="mt-3 text-gray-600">
                    Open your camera app and scan a code. It will take you directly to the store listing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDownloadModal(true)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  See download options
                </button>
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">iPhone / iPad</div>
                      <div className="text-sm text-gray-600">App Store</div>
                    </div>
                    <a
                      href={links.ios}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Open link
                    </a>
                  </div>
                  <div className="mt-5 flex justify-center">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <QRCodeSVG value={links.ios} size={180} includeMargin />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Android</div>
                      <div className="text-sm text-gray-600">Google Play</div>
                    </div>
                    <a
                      href={links.android}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Open link
                    </a>
                  </div>
                  <div className="mt-5 flex justify-center">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <QRCodeSVG value={links.android} size={180} includeMargin />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 rounded-2xl bg-gray-50 border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">Need help?</h3>
                <ul className="mt-3 text-sm text-gray-700 space-y-2">
                  <li>• If you’re on iPhone, make sure you’re signed into the App Store.</li>
                  <li>• If you’re on Android, enable updates in Google Play to get new releases automatically.</li>
                  <li>• For support, use the Contact section on the homepage.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <Footer />
        <ScrollToTop />
        <DownloadModal open={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
      </div>
    </div>
  );
}

