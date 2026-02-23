import Link from 'next/link';
import BlogTopBar from '../../components/BlogTopBar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export const metadata = {
  title: 'Unsubscribe | GlucoForager',
  description: 'Unsubscribe from GlucoForager newsletter updates.',
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ searchParams }) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token.trim() : '';

  let status = { ok: false, message: 'Invalid unsubscribe link.' };

  if (!token) {
    status = { ok: false, message: 'Missing unsubscribe token.' };
  } else {
    try {
      const res = await fetch(`${API_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          status = {
            ok: true,
            message: data?.already ? 'You are already unsubscribed.' : 'You have been unsubscribed.',
          };
        } else {
          status = { ok: false, message: 'Unable to unsubscribe with this link.' };
        }
      } else {
        status = { ok: false, message: 'Unable to unsubscribe with this link.' };
      }
    } catch {
      status = { ok: false, message: 'Unable to unsubscribe right now. Please try again later.' };
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <BlogTopBar rightHref="/" rightLabel="Back to home" />
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Unsubscribe</h1>
          <p className="mt-3 text-gray-700">{status.message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-2.5 text-white font-semibold shadow-sm hover:bg-teal-700 transition-colors"
            >
              Go to home
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2.5 text-gray-800 font-semibold hover:bg-gray-50 transition-colors"
            >
              Visit blog
            </Link>
          </div>
          {!status.ok ? (
            <p className="mt-6 text-sm text-gray-500">
              If you still receive emails, contact us at{' '}
              <a className="text-teal-700 font-semibold hover:text-teal-900" href="mailto:hello@glucoforager.com">
                hello@glucoforager.com
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

