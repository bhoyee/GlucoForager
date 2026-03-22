"use client";

import { QRCodeSVG } from "qrcode.react";

export default function DownloadModal({ open, onClose }) {
  const appleAppStoreUrl = "https://apps.apple.com/us/app/glucoforager/id6758808427";
  const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.glucoforager.app";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Get GlucoForager</h3>
            <p className="text-gray-600">
              Download the app to get meal ideas, swaps, and daily plans for steadier blood sugar.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <a
              href={appleAppStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full bg-black text-white rounded-xl px-6 py-4 hover:bg-gray-800 transition-all duration-300 hover:scale-[1.02]"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 384 512">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              <div className="text-left">
                <div className="text-xs opacity-80">Download on the</div>
                <div className="font-semibold text-lg">App Store</div>
              </div>
            </a>

            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full bg-black text-white rounded-xl px-6 py-4 hover:bg-gray-800 transition-all duration-300 hover:scale-[1.02]"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 512 512">
                <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
              </svg>
              <div className="text-left">
                <div className="text-xs opacity-80">GET IT ON</div>
                <div className="font-semibold text-lg">Google Play</div>
              </div>
            </a>
          </div>

          <div className="border-t pt-6">
            <div className="text-center mb-4">
              <h4 className="font-semibold text-gray-900 mb-2">Scan QR Code to Download</h4>
              <p className="text-sm text-gray-600 mb-4">
                Scan with your phone's camera to download the app
              </p>
            </div>

            <div className="flex justify-center gap-8">
              <div className="text-center">
                <a
                  href={appleAppStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-32 h-32 mx-auto bg-white rounded-lg overflow-hidden mb-2 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  aria-label="Open Apple App Store listing"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <QRCodeSVG value={appleAppStoreUrl} size={112} includeMargin />
                  </div>
                </a>
                <div className="text-xs text-gray-600">For iPhone</div>
              </div>

              <div className="text-center">
                <a
                  href={googlePlayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-32 h-32 mx-auto bg-white rounded-lg overflow-hidden mb-2 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  aria-label="Open Google Play Store listing"
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <QRCodeSVG value={googlePlayUrl} size={112} includeMargin />
                  </div>
                </a>
                <div className="text-xs text-gray-600">For Android</div>
              </div>
            </div>

            <p className="text-sm text-gray-500 text-center mt-4">
              Note: In-app purchases available after download
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
