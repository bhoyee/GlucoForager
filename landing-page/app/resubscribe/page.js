import Link from 'next/link';
import BlogTopBar from '../../components/BlogTopBar';
import AppDownloadCard from '../../components/AppDownloadCard';

export const metadata = {
  title: 'Resubscribe | GlucoForager',
  description: 'Resubscribe to GlucoForager Premium from the app.',
  robots: { index: false, follow: false },
};

export default function ResubscribePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <BlogTopBar rightHref="/" rightLabel="Back to home" />
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">Resubscribe to Premium</h1>
          <p className="mt-3 text-gray-700">
            Already have GlucoForager installed? Just open the app and tap Upgrade from the home screen.
          </p>
        </div>

        <AppDownloadCard className="mt-6" />

        <div className="mt-6 text-center">
          <Link href="/" className="text-teal-700 font-semibold hover:text-teal-900">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
