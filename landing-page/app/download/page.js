import Header from '../../components/Header';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.glucoforager.app';
const APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/us/app/glucoforager/id6758808427';

export const metadata = {
  title: 'Download',
  description: 'Download GlucoForager, your daily diabetes food assistant for meal ideas, swaps, and daily plans.',
  alternates: { canonical: '/download' },
  openGraph: {
    title: 'Download GlucoForager',
    description: 'Get the app on Android and iOS to decide what to eat with diabetes without guessing.',
    url: `${SITE_URL}/download`,
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function DownloadPage() {
  const hasIos = Boolean(APP_STORE_URL && APP_STORE_URL.startsWith('http'));

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-20">
      <div className="container mx-auto max-w-4xl px-4 py-12 space-y-10">
        <header className="space-y-3">
          <h1 className="text-4xl font-extrabold text-gray-900">Download GlucoForager</h1>
          <p className="text-gray-600">
            GlucoForager helps you turn ingredients into diabetes-friendly meal ideas with clear nutrition context.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-bold text-gray-900">Get the app</h2>
          <p className="text-gray-600 mt-2">
            Choose your platform below. If a store page is still processing, try again later.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-semibold"
              href={hasIos ? APP_STORE_URL : SITE_URL}
              rel="noreferrer"
              target="_blank"
            >
              App Store
            </a>

            <a
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-semibold"
              href={PLAY_STORE_URL}
              rel="noreferrer"
              target="_blank"
            >
              Google Play
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">What you can do with GlucoForager</h2>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Scan your fridge or pantry, type what you have, or tap Surprise Me for instant diabetes-friendly recipe ideas.</li>
            <li>Get clear recipe steps with per-meal nutrition estimates (calories, carbs, protein, and fibre).</li>
            <li>Use food swaps and portion tips to reduce carb load without losing the foods you like.</li>
            <li>Get daily tips and challenges to build steadier blood-sugar habits over time.</li>
            <li>Build a shopping list from scratch or straight from a recipe, and check items off as you shop.</li>
            <li>Ask GlucoGuide AI quick food questions and get everyday, profile-aware guidance.</li>
            <li>Save favourites and revisit your recipe history to repeat what works.</li>
            <li>Track your streak and see a weekly recap of your recipes, favourites, and check-ins.</li>
            <li>Premium: generate a full-day meal plan (breakfast, lunch, dinner + snack) with the Daily Meal Planner.</li>
          </ul>
          <p className="text-sm text-gray-500">
            Note: GlucoForager provides informational recipe suggestions and is not medical advice.
          </p>
        </section>

        <section className="flex flex-wrap gap-3">
          <a
            className="inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2.5 text-gray-800 font-semibold hover:bg-gray-50 transition-colors"
            href="/features"
          >
            View features
          </a>
          <a
            className="inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2.5 text-gray-800 font-semibold hover:bg-gray-50 transition-colors"
            href="/pricing"
          >
            Pricing
          </a>
          <a
            className="inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2.5 text-gray-800 font-semibold hover:bg-gray-50 transition-colors"
            href="/blog"
          >
            Read the blog
          </a>
        </section>
      </div>
      </main>
    </>
  );
}
