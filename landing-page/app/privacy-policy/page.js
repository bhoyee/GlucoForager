import Link from 'next/link';
import Image from 'next/image';

export default function PrivacyPolicy() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {/* ... rest of the privacy policy content remains the same ... */}
        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-4">
              Welcome to GlucoForager ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services.
            </p>
            <p className="text-gray-700">
              Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the application.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">Personal Information</h3>
            <p className="text-gray-700 mb-3">
              When you use GlucoForager, we may collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Email address (if you choose to create an account)</li>
              <li>Name (optional)</li>
              <li>Dietary preferences and restrictions</li>
              <li>Recipe preferences and saved recipes</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Automatically Collected Information</h3>
            <p className="text-gray-700 mb-3">
              We may automatically collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li>Device information (type, operating system, unique device identifiers)</li>
              <li>Usage data (features used, time spent in app)</li>
              <li>App performance data (crash reports, errors)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 mb-3">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Provide and maintain our services</li>
              <li>Personalize your experience with diabetes-friendly recipe suggestions</li>
              <li>Improve our AI algorithms and app functionality</li>
              <li>Communicate with you about updates, features, and offers</li>
              <li>Ensure app security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Photo Processing</h2>
            <p className="text-gray-700 mb-4">
              When you use our AI food recognition feature:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Food photos are processed in real-time by our AI service providers (OpenAI/DeepSeek)</li>
              <li>We do not store your food photos on our servers</li>
              <li>Photos are deleted immediately after processing</li>
              <li>Only the detected ingredients are used to generate recipe suggestions</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-700">
              We implement appropriate technical and organizational security measures to protect your personal information. However, please note that no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

            <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Your Rights (GDPR & UK GDPR)</h2>
            <p className="text-gray-700 mb-3">
                Under the UK General Data Protection Regulation (UK GDPR), you have the right to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Right of access:</strong> Request copies of your personal data</li>
                <li><strong>Right to rectification:</strong> Request correction of inaccurate data</li>
                <li><strong>Right to erasure:</strong> Request deletion of your personal data</li>
                <li><strong>Right to restrict processing:</strong> Request restriction of processing</li>
                <li><strong>Right to data portability:</strong> Request transfer of your data</li>
                <li><strong>Right to object:</strong> Object to processing of your data</li>
            </ul>
            <p className="text-gray-700">
                To exercise these rights, contact us at hello@glucoforager.com. We will respond within one month.
            </p>
            </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Children's Privacy</h2>
            <p className="text-gray-700">
              Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Changes to This Policy</h2>
            <p className="text-gray-700">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Contact Us</h2>
            <p className="text-gray-700">
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p className="text-gray-700 mt-2">
              Email: privacy@glucoforager.com<br />
              Address: 123 Health Street, San Francisco, CA 94107
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