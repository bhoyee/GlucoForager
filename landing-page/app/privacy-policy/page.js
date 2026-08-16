import Link from 'next/link';
import Image from 'next/image';

const LAST_UPDATED = 'August 16, 2026';

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
            Back to Home
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: {LAST_UPDATED}</p>
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
              <li>Recipe preferences and saved recipes</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Health Information</h3>
            <p className="text-gray-700 mb-3">
              Because GlucoForager is built around diabetes-friendly nutrition, we also collect health-related information you choose to provide, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Diabetes type / status</li>
              <li>Dietary preferences, restrictions, and food allergen or exclusion choices</li>
            </ul>
            <p className="text-gray-700 mb-4">
              This is treated as sensitive health information under applicable law (see Sections 9–11 for the specific rights and protections that apply to it).
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Automatically Collected Information</h3>
            <p className="text-gray-700 mb-3">
              We may automatically collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700">
              <li>Device information (type, operating system, unique device identifiers)</li>
              <li>Push notification token, if you enable notifications</li>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. AI & Photo Processing</h2>
            <p className="text-gray-700 mb-4">
              When you use our AI food recognition or recipe generation features:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>Food photos and recipe text are processed by our AI service providers: OpenAI, Google Gemini, DeepSeek, and Runware (for AI-generated recipe images)</li>
              <li>Food photos are used to detect ingredients and are not retained on our servers once that processing step completes</li>
              <li>Only the detected ingredients, not the photo itself, are used to generate recipe suggestions</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Sharing & Third Parties</h2>
            <p className="text-gray-700 mb-3">
              We do not sell your personal information. We share information only with service providers who help us operate GlucoForager, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li><strong>Subscription billing:</strong> RevenueCat, and the Apple App Store / Google Play, to process and manage your subscription</li>
              <li><strong>AI processing:</strong> OpenAI, Google Gemini, DeepSeek, and Runware, as described in Section 4</li>
              <li><strong>Email delivery:</strong> Resend, to send account and transactional emails</li>
            </ul>
            <p className="text-gray-700">
              Each of these providers processes information only as needed to perform their service for us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-700 mb-3">
              We retain your account information for as long as your account is active. If you request deletion, we delete your account and associated personal data within 30 days as described in Section 14, unless we are required to retain certain information for legal, security, or fraud-prevention purposes.
            </p>
            <p className="text-gray-700">
              Food photos submitted for AI recognition are not retained after processing, as described in Section 4.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. International Data Transfers</h2>
            <p className="text-gray-700">
              Our AI and service providers are based in the United States. If you are located in the European Economic Area, the United Kingdom, or elsewhere outside the US, using GlucoForager means your information may be transferred to and processed in the US. We rely on the safeguards each provider makes available for these transfers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Data Security</h2>
            <p className="text-gray-700">
              We implement appropriate technical and organizational security measures to protect your personal information. However, please note that no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

            <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Your Rights (GDPR & UK GDPR)</h2>
            <p className="text-gray-700 mb-3">
                Under the General Data Protection Regulation (GDPR) and UK GDPR, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Right of access:</strong> Request copies of your personal data</li>
                <li><strong>Right to rectification:</strong> Request correction of inaccurate data</li>
                <li><strong>Right to erasure:</strong> Request deletion of your personal data</li>
                <li><strong>Right to restrict processing:</strong> Request restriction of processing</li>
                <li><strong>Right to data portability:</strong> Request transfer of your data</li>
                <li><strong>Right to object:</strong> Object to processing of your data</li>
            </ul>
            <p className="text-gray-700 mb-3">
                We process most account information under our contract with you (to provide the app) and to meet legal obligations. Health information described in Section 2 is processed only on the basis of your <strong>explicit consent</strong>, which you may withdraw at any time by contacting us or deleting your account.
            </p>
            <p className="text-gray-700">
                To exercise these rights, contact us at hello@glucoforager.com. We will respond within one month.
            </p>
            </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-gray-700 mb-3">
              If you are a California resident, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li><strong>Right to know:</strong> Request what personal information we have collected about you</li>
              <li><strong>Right to delete:</strong> Request deletion of your personal information</li>
              <li><strong>Right to correct:</strong> Request correction of inaccurate personal information</li>
              <li><strong>Right to opt out of sale or sharing:</strong> We do not sell or share your personal information</li>
              <li><strong>Right to limit use of sensitive personal information:</strong> Your health information (Section 2) is sensitive personal information under the CPRA; we use it only to provide the app's core features</li>
            </ul>
            <p className="text-gray-700">
              We will not discriminate against you for exercising any of these rights. To exercise them, contact us at hello@glucoforager.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Washington Consumer Health Data</h2>
            <p className="text-gray-700 mb-3">
              Washington's My Health My Data Act treats certain health-related information as "consumer health data." Diabetes type/status and related dietary and food-exclusion preferences described in Section 2 fall into this category.
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4">
              <li>We collect and use this data only as needed to provide GlucoForager's diabetes-friendly recipe features</li>
              <li>We do not sell consumer health data</li>
              <li>We do not use consumer health data for geofenced advertising</li>
              <li>You may withdraw your consent to our collection or use of this data at any time by contacting us or deleting your account (Section 14)</li>
            </ul>
            <p className="text-gray-700">
              To exercise these rights, contact us at hello@glucoforager.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Children's Privacy</h2>
            <p className="text-gray-700">
              Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-700">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Account Deletion</h2>
            <p className="text-gray-700 mb-3">
              You can request deletion of your account and associated personal data at any time.
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-3">
              <li>Email us at hello@glucoforager.com with the subject "Delete My Account".</li>
              <li>Include the email address associated with your GlucoForager account.</li>
            </ul>
            <p className="text-gray-700 mb-4">
              We will delete your account and associated personal data within 30 days, unless we are required to
              retain certain information for legal, security, or fraud-prevention purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Us</h2>
            <p className="text-gray-700">
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p className="text-gray-700 mt-2">
              Email: hello@glucoforager.com
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <a href="/" className="text-teal-600 hover:text-teal-700 font-medium">
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}

