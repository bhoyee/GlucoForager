import Link from 'next/link';
import Image from 'next/image';

export default function CookiePolicy() {
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

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Cookie Policy</h1>
          <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. What Are Cookies</h2>
            <p className="text-gray-700">
              Cookies are small text files that are placed on your device when you visit our website or use our app. They help us provide you with a better experience by remembering your preferences and understanding how you use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. How We Use Cookies</h2>
            <p className="text-gray-700 mb-3">
              We use cookies for the following purposes:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li><strong>Essential Cookies:</strong> Necessary for the website to function properly</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
              <li><strong>Advertising Cookies:</strong> Used to deliver relevant advertisements (free version only)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Types of Cookies We Use</h2>
            
            <div className="bg-gray-50 rounded-xl p-6 mb-4">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Essential Cookies</h3>
              <p className="text-gray-700 mb-2">
                These cookies are necessary for our website to function and cannot be switched off.
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Session management</li>
                <li>Security features</li>
                <li>Load balancing</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-4">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Analytics Cookies</h3>
              <p className="text-gray-700 mb-2">
                These cookies help us understand how visitors interact with our website.
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Google Analytics: Tracks website usage and performance</li>
                <li>Hotjar: Understands user behavior and improves UX</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Marketing Cookies</h3>
              <p className="text-gray-700 mb-2">
                These cookies are used to track visitors across websites to display relevant advertisements.
              </p>
              <ul className="list-disc pl-6 text-gray-700">
                <li>Facebook Pixel: For Facebook advertising</li>
                <li>Google Ads: For Google advertising campaigns</li>
              </ul>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Managing Cookies</h2>
            <p className="text-gray-700 mb-3">
              You can control and/or delete cookies as you wish. You can delete all cookies that are already on your computer and you can set most browsers to prevent them from being placed.
            </p>
            <p className="text-gray-700 mb-3">
              However, if you do this, you may have to manually adjust some preferences every time you visit a site and some services and functionalities may not work.
            </p>
            <p className="text-gray-700">
              Most web browsers allow some control of most cookies through the browser settings. To find out more about cookies, including how to see what cookies have been set, visit <a href="https://www.aboutcookies.org" className="text-teal-600 hover:underline">www.aboutcookies.org</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Third-Party Cookies</h2>
            <p className="text-gray-700">
              In some special cases, we also use cookies provided by trusted third parties. The following section details which third-party cookies you might encounter through this site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. App-Specific Considerations</h2>
            <p className="text-gray-700 mb-3">
              For our mobile app, we may use similar technologies:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li><strong>Device Identifiers:</strong> Unique identifiers associated with your device</li>
              <li><strong>Local Storage:</strong> Stores app preferences and data locally on your device</li>
              <li><strong>Push Tokens:</strong> For sending push notifications (with your permission)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700">
              Under GDPR and other privacy regulations, you have the right to control how cookies are used. You can adjust your cookie preferences at any time through our cookie consent banner or your browser settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Updates to This Policy</h2>
            <p className="text-gray-700">
              We may update this Cookie Policy from time to time to reflect changes in technology, legislation, or our data practices. We encourage you to check this page periodically for the latest information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Contact Us</h2>
            <p className="text-gray-700">
              If you have any questions about our use of cookies, please contact us at:<br />
              privacy@glucoforager.com
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <a href="/" className="text-teal-600 hover:text-teal-700 font-medium">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}