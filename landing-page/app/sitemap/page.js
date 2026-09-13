import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Sitemap',
  description: 'A complete list of all pages and sections available on GlucoForager.',
  alternates: { canonical: '/sitemap' },
  robots: { index: true, follow: true },
};

export default function Sitemap() {
  const pages = [
    {
      category: 'Main Pages',
      links: [
        { name: 'Home', path: '/', description: 'Main landing page with hero section and app overview' },
        { name: 'Features', path: '/features', description: 'Barcode & photo food scanning, glucose logging, daily carb goal, meal planning, and more' },
        { name: 'Pricing', path: '/pricing', description: 'Free forever plan plus a 7-day trial for Premium AI features' },
        { name: 'Blog', path: '/blog', description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates' },
        { name: 'Download the App', path: '/download', description: 'Get GlucoForager on iOS or Android' },
        { name: 'Careers', path: '/careers', description: 'Open roles at GlucoForager' },
      ],
    },
    {
      category: 'Homepage Sections',
      links: [
        { name: 'How It Works', path: '/#how-it-works', description: 'How scanning, logging, and meal ideas fit together' },
        { name: 'Features Preview', path: '/#features', description: 'A quick look at the app’s core features' },
        { name: 'Testimonials', path: '/#testimonials', description: 'User stories and feedback' },
        { name: 'FAQ', path: '/#faq', description: 'Frequently asked questions about GlucoForager' },
        { name: 'Contact', path: '/#contact', description: 'Contact form and support information' },
      ],
    },
    {
      category: 'Legal & Policy',
      links: [
        { name: 'Privacy Policy', path: '/privacy-policy', description: 'How we collect, use, and protect your data' },
        { name: 'Terms & Conditions', path: '/terms', description: 'Terms of service and user agreements' },
        { name: 'Cookie Policy', path: '/cookie-policy', description: 'Information about cookies and tracking' },
      ],
    },
    {
      category: 'App Store Links',
      links: [
        {
          name: 'iOS Download',
          path: 'https://apps.apple.com/us/app/glucoforager/id6758808427',
          description: 'Download from the Apple App Store',
          external: true,
        },
        {
          name: 'Android Download',
          path: 'https://play.google.com/store/apps/details?id=com.glucoforager.app',
          description: 'Download from Google Play',
          external: true,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Simple Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
          {/* Logo - Using actual image */}
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
                         <span className="text-xl font-bold text-gray-900">GlucoForager</span>
          </Link>
          <Link
            href="/"
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Sitemap</h1>
          <p className="text-gray-600">
            A complete list of all pages and sections available on GlucoForager.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {pages.map((category, index) => (
            <div key={index} className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">{category.category}</h2>
              <div className="space-y-4">
                {category.links.map((link, linkIndex) => (
                  <div key={linkIndex} className="border-l-4 border-teal-500 pl-4">
                    {link.external ? (
                      <a
                        href={link.path}
                        target="_blank"
                        rel="noreferrer"
                        className="text-lg font-semibold text-gray-900 hover:text-teal-600 transition-colors block mb-1"
                      >
                        {link.name}
                      </a>
                    ) : (
                      <Link
                        href={link.path}
                        className="text-lg font-semibold text-gray-900 hover:text-teal-600 transition-colors block mb-1"
                      >
                        {link.name}
                      </Link>
                    )}
                    <p className="text-gray-600 text-sm">{link.description}</p>
                    <div className="mt-1">
                      <span className="text-xs text-teal-600 font-medium">{link.path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Additional Information */}
        <div className="mt-12 bg-teal-50 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">About This Sitemap</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Website Structure</h3>
              <p className="text-gray-700">
                GlucoForager.com combines standalone pages (Features, Pricing, Blog, Download) with a homepage that
                links to a few of its own sections directly via anchor links.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Mobile App</h3>
              <p className="text-gray-700">
                The GlucoForager mobile app is live now on iOS and Android - free to start, with a 7-day trial for
                Premium features like AI photo scanning and the Daily Meal Planner.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-gray-700">
              Can't find what you're looking for? Try our search or contact support.
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
              ← Back to Home
            </Link>
            <Link href="/#contact" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors font-medium">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
