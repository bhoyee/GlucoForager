import { Fragment } from 'react';
import Link from 'next/link';
import Footer from '../../components/Footer';
import BlogTopBar from '../../components/BlogTopBar';
import AppDownloadCard from '../../components/AppDownloadCard';
import {
  MEAL_FILTERS,
  MEAL_LABEL,
  QUICK_FILTERS,
  SITE_URL,
  fetchRecipeList,
  minutesLabel,
  recipesHref,
  resolveImage,
  round,
} from '../../lib/recipes';

export const revalidate = 600;

const PAGE_SIZE = 24;

const pageTitle = (meal, quick) => {
  const quickLabel = { low_carb: 'Low-Carb', under_20: 'Quick (Under 20 Min)', high_protein: 'High-Protein', vegetarian: 'Vegetarian' }[quick];
  const mealLabel = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }[meal];
  return ['Diabetes-Friendly', quickLabel, mealLabel, 'Recipes'].filter(Boolean).join(' ');
};

const cleanParams = (searchParams) => {
  const meal = MEAL_FILTERS.some((f) => f.value === searchParams?.meal) ? searchParams.meal : null;
  const quick = QUICK_FILTERS.some((f) => f.value === searchParams?.quick) ? searchParams.quick : null;
  const page = Math.max(1, Math.min(200, Number.parseInt(searchParams?.page, 10) || 1));
  return { meal, quick, page };
};

export async function generateMetadata({ searchParams }) {
  const { meal, quick, page } = cleanParams(searchParams);
  const title = pageTitle(meal, quick);
  const description =
    'Free diabetes-friendly recipes with carbs, protein and fiber per serving. Low-carb breakfasts, lunches, dinners and snacks for Type 1, Type 2, prediabetes and gestational diabetes.';
  const canonical = recipesHref({ meal, quick, page });
  return {
    title: page > 1 ? `${title} – Page ${page}` : title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function FilterChip({ href, active, children }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-teal-600 hover:text-teal-700'
      }`}
    >
      {children}
    </Link>
  );
}

function RecipeCard({ recipe }) {
  const time = minutesLabel(recipe.total_minutes);
  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveImage(recipe.image_url)}
          alt={recipe.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {recipe.carbs != null && recipe.carbs <= 30 ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-green-700">Low carb</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{MEAL_LABEL[recipe.meal_type] || 'Recipe'}</span>
        <h2 className="mt-1 text-lg font-bold leading-snug text-gray-900 group-hover:text-teal-800">{recipe.name}</h2>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-sm text-gray-600">
          {recipe.carbs != null ? <span><strong className="text-gray-900">{round(recipe.carbs)}g</strong> carbs</span> : null}
          {recipe.calories != null ? <span>{round(recipe.calories)} kcal</span> : null}
          {time ? <span>{time}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export default async function RecipesIndexPage({ searchParams }) {
  const { meal, quick, page } = cleanParams(searchParams);
  let data = { items: [], total: 0 };
  let unavailable = false;
  try {
    data = await fetchRecipeList({ meal, quick, page, pageSize: PAGE_SIZE });
  } catch {
    unavailable = true;
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / PAGE_SIZE));
  const title = pageTitle(meal, quick);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: items.map((r, i) => ({
      '@type': 'ListItem',
      position: (page - 1) * PAGE_SIZE + i + 1,
      url: `${SITE_URL}/recipes/${r.slug}`,
      name: r.name,
    })),
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogTopBar rightHref="/download" rightLabel="Get the app" />

      <section className="bg-gradient-to-br from-teal-800 to-emerald-700 text-white">
        <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal-100">Free recipe library</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-teal-50/90">
            Simple meals built for steadier blood sugar, with carbs, protein and fiber for every serving.
            Want recipes made from what's already in your fridge? The GlucoForager app does that in seconds.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/download" className="rounded-full bg-white px-6 py-3 font-semibold text-teal-800 shadow hover:bg-teal-50">
              Get the free app
            </Link>
            <Link href="/features" className="rounded-full border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="Recipe filters" className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip href={recipesHref({ quick })} active={!meal}>All meals</FilterChip>
            {MEAL_FILTERS.map((f) => (
              <FilterChip key={f.value} href={recipesHref({ meal: f.value, quick })} active={meal === f.value}>
                {f.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                href={recipesHref({ meal, quick: quick === f.value ? null : f.value })}
                active={quick === f.value}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        </nav>

        {unavailable ? (
          <p className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            Recipes are temporarily unavailable. Please try again in a moment.
          </p>
        ) : items.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            No recipes match these filters yet.{' '}
            <Link href="/recipes" className="font-semibold text-teal-700">See all recipes</Link>
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((recipe, i) => (
              <Fragment key={recipe.id}>
                <RecipeCard recipe={recipe} />
                {i === 5 ? (
                  <div className="flex flex-col justify-center rounded-2xl bg-teal-50 p-6 sm:col-span-2 lg:col-span-1">
                    <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">In the app</p>
                    <h2 className="mt-1 text-xl font-bold text-gray-900">Snap your fridge, get recipes like these</h2>
                    <p className="mt-2 text-gray-700">
                      Personalised to your diabetes type, cuisine and the foods you avoid. Try Premium free for 7 days, no card needed.
                    </p>
                    <Link href="/download" className="mt-4 inline-flex w-fit rounded-full bg-teal-700 px-5 py-2.5 font-semibold text-white hover:bg-teal-800">
                      Download GlucoForager
                    </Link>
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
            {page > 1 ? (
              <Link href={recipesHref({ meal, quick, page: page - 1 })} className="rounded-full border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 hover:border-teal-600">
                ← Previous
              </Link>
            ) : null}
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={recipesHref({ meal, quick, page: page + 1 })} className="rounded-full border border-gray-200 bg-white px-5 py-2 font-semibold text-gray-700 hover:border-teal-600">
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}

        <div className="mt-14 grid gap-6 md:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            <h2 className="text-xl font-bold text-gray-900">About these recipes</h2>
            <p className="mt-3 leading-7">
              Every recipe is designed with blood sugar in mind: mostly lower in carbs, built around protein, fiber and
              vegetables, and checked for complete nutrition before it's published. Nutrition values are estimates per serving.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              These recipes are general guidance, not medical advice. Your carb needs depend on your treatment and goals, so
              check with your doctor, diabetes nurse or dietitian if you're unsure.
            </p>
          </section>
          <AppDownloadCard />
        </div>
      </div>
      <Footer />
    </main>
  );
}
