import Link from 'next/link';
import Image from 'next/image';


export default function TermsAndConditions() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms & Conditions</h1>
          <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        <div className="prose prose-lg max-w-none">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-amber-800 mb-2">⚠️ Important Medical Disclaimer</h3>
            <p className="text-amber-700">
              GlucoForager provides AI-generated recipe suggestions for informational purposes only. It is not a medical device and does not provide medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for personalized medical guidance.
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700">
              By accessing or using GlucoForager ("the App"), you agree to be bound by these Terms & Conditions. If you disagree with any part of these terms, you may not access the App.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-700 mb-3">
              GlucoForager is an AI-powered mobile application that:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li>Analyzes photos of food ingredients using AI</li>
              <li>Generates diabetes-friendly recipe suggestions</li>
              <li>Provides meal planning tools for diabetes management</li>
              <li>Offers basic and premium subscription plans</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. User Accounts</h2>
            <p className="text-gray-700 mb-3">
              When you create an account with us, you must provide accurate information. You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li>Maintaining the confidentiality of your account</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized use</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription Plans</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">Free Plan</h3>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>3 AI scans per day</li>
              <li>Basic recipe generation</li>
              <li>Contains advertisements</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Premium Plan</h3>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Unlimited AI scans</li>
              <li>Advanced recipe features</li>
              <li>No advertisements</li>
              <li>Recipe saving and organization</li>
            </ul>

            <p className="text-gray-700 mb-3">
              Premium subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. You can cancel subscriptions through your app store account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Intellectual Property</h2>
            <p className="text-gray-700">
              The App and its original content, features, and functionality are owned by GlucoForager and are protected by international copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. User Content</h2>
            <p className="text-gray-700 mb-3">
              By submitting content (photos, feedback, etc.) to the App, you grant us a non-exclusive, worldwide, royalty-free license to use, modify, and display such content for the purpose of providing our services.
            </p>
            <p className="text-gray-700">
              You retain ownership of your food photos, which are processed but not stored by our system.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Limitation of Liability</h2>
            <p className="text-gray-700 mb-3">
              To the maximum extent permitted by law, GlucoForager shall not be liable for:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Any indirect, incidental, or consequential damages</li>
              <li>Loss of data or profits</li>
              <li>Health outcomes resulting from recipe suggestions</li>
              <li>Inaccuracies in AI-generated content</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Termination</h2>
            <p className="text-gray-700">
              We may terminate or suspend your account immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Governing Law</h2>
            <p className="text-gray-700">
                These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes relating to these terms will be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Changes to Terms</h2>
            <p className="text-gray-700">
              We reserve the right to modify these terms at any time. We will provide notice of significant changes through the App or via email.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Contact Information</h2>
            <p className="text-gray-700">
              For questions about these Terms, contact us at:<br />
              hello@glucoforager.com<br />
              
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