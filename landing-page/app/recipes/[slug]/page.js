import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import Footer from '../../../components/Footer';
import BlogTopBar from '../../../components/BlogTopBar';
import AppDownloadCard from '../../../components/AppDownloadCard';
import {
  MEAL_LABEL,
  SITE_URL,
  fetchRecipe,
  ingredientText,
  isoDuration,
  minutesLabel,
  resolveImage,
  round,
} from '../../../lib/recipes';

export const revalidate = 600;

const describe = (recipe) => {
  const facts = [
    recipe.carbs != null ? `${round(recipe.carbs)}g carbs` : null,
    recipe.protein != null ? `${round(recipe.protein)}g protein` : null,
    recipe.calories != null ? `${round(recipe.calories)} calories` : null,
  ].filter(Boolean);
  const base = recipe.description || `A diabetes-friendly ${MEAL_LABEL[recipe.meal_type]?.toLowerCase() || 'recipe'}.`;
  return `${base} ${facts.length ? `${facts.join(', ')} per serving.` : ''}`.trim().slice(0, 300);
};

async function loadRecipe(slug) {
  try {
    return await fetchRecipe(slug);
  } catch {
    return undefined; // API down: show a friendly message instead of a 404
  }
}

export async function generateMetadata({ params }) {
  const recipe = await loadRecipe(params.slug);
  if (!recipe) return { title: 'Recipe not found', robots: { index: false } };
  const url = `${SITE_URL}/recipes/${recipe.slug}`;
  const title = `${recipe.name} – Diabetes-Friendly Recipe`;
  const description = describe(recipe);
  const image = resolveImage(recipe.image_url);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article', images: image ? [{ url: image, alt: recipe.name }] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

function Stat({ label, value, unit, highlight }) {
  if (value == null) return null;
  return (
    <div className={`rounded-2xl p-4 text-center ${highlight ? 'bg-teal-700 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="text-2xl font-extrabold">
        {round(value)}
        <span className="text-base font-semibold">{unit}</span>
      </div>
      <div className={`text-xs font-semibold uppercase tracking-wide ${highlight ? 'text-teal-100' : 'text-gray-500'}`}>{label}</div>
    </div>
  );
}

export default async function RecipePage({ params }) {
  const recipe = await loadRecipe(params.slug);
  if (recipe === null) notFound();
  if (recipe === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <BlogTopBar rightHref="/recipes" rightLabel="All recipes" />
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-3xl font-bold text-gray-900">This recipe is temporarily unavailable</h1>
          <p className="mt-3 text-gray-700">Please try again in a moment.</p>
        </div>
      </main>
    );
  }
  // Old or mistyped slugs (same id) go to the one canonical address.
  if (params.slug !== recipe.slug) permanentRedirect(`/recipes/${recipe.slug}`);

  const url = `${SITE_URL}/recipes/${recipe.slug}`;
  const image = resolveImage(recipe.image_url);
  const n = recipe.nutrition || {};
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];
  const meal = MEAL_LABEL[recipe.meal_type] || 'Recipe';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.name,
      description: describe(recipe),
      image: image ? [image] : undefined,
      author: { '@type': 'Organization', name: 'GlucoForager', url: SITE_URL },
      datePublished: recipe.created_at,
      dateModified: recipe.updated_at,
      prepTime: isoDuration(recipe.prep_minutes),
      cookTime: isoDuration(recipe.cook_minutes),
      totalTime: isoDuration(recipe.total_minutes),
      recipeYield: recipe.servings ? `${recipe.servings} servings` : undefined,
      recipeCategory: meal,
      recipeCuisine: recipe.cuisine_tags?.length ? recipe.cuisine_tags.map((t) => t.replace(/_/g, ' ')).join(', ') : undefined,
      keywords: ['diabetes friendly', 'diabetic recipe', recipe.carbs != null && recipe.carbs <= 30 ? 'low carb' : null, 'blood sugar friendly']
        .filter(Boolean)
        .join(', '),
      suitableForDiet: 'https://schema.org/DiabeticDiet',
      recipeIngredient: ingredients.map(ingredientText),
      recipeInstructions: steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
      nutrition: {
        '@type': 'NutritionInformation',
        servingSize: '1 serving',
        calories: n.calories != null ? `${round(n.calories)} calories` : undefined,
        carbohydrateContent: n.carbs != null ? `${round(n.carbs)} g` : undefined,
        proteinContent: n.protein != null ? `${round(n.protein)} g` : undefined,
        fatContent: n.fat != null ? `${round(n.fat)} g` : undefined,
        fiberContent: n.fiber != null ? `${round(n.fiber)} g` : undefined,
        sugarContent: n.sugar != null ? `${round(n.sugar)} g` : undefined,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Recipes', item: `${SITE_URL}/recipes` },
        { '@type': 'ListItem', position: 3, name: recipe.name, item: url },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogTopBar rightHref="/download" rightLabel="Get the app" />

      <div className="container mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <Link href="/" className="hover:text-teal-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/recipes" className="hover:text-teal-700">Recipes</Link>
          <span className="mx-2">/</span>
          <Link href={`/recipes?meal=${recipe.meal_type}`} className="hover:text-teal-700">{meal}</Link>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
          <article className="min-w-0 space-y-8">
            <header className="space-y-4">
              <span className="text-sm font-semibold uppercase tracking-wide text-teal-700">Diabetes-friendly {meal.toLowerCase()}</span>
              <h1 className="text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">{recipe.name}</h1>
              {recipe.description ? <p className="text-lg leading-8 text-gray-700">{recipe.description}</p> : null}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
                {recipe.prep_minutes ? <span>Prep <strong className="text-gray-900">{minutesLabel(recipe.prep_minutes)}</strong></span> : null}
                {recipe.cook_minutes ? <span>Cook <strong className="text-gray-900">{minutesLabel(recipe.cook_minutes)}</strong></span> : null}
                {recipe.servings ? <span>Serves <strong className="text-gray-900">{recipe.servings}</strong></span> : null}
              </div>
            </header>

            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={recipe.name} className="aspect-[16/10] w-full rounded-3xl object-cover shadow-sm" />
            ) : null}

            <section aria-labelledby="nutrition-heading">
              <h2 id="nutrition-heading" className="text-xl font-bold text-gray-900">Nutrition per serving</h2>
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Carbs" value={n.carbs} unit="g" highlight />
                <Stat label="Fiber" value={n.fiber} unit="g" />
                <Stat label="Sugar" value={n.sugar} unit="g" />
                <Stat label="Protein" value={n.protein} unit="g" />
                <Stat label="Fat" value={n.fat} unit="g" />
                <Stat label="Calories" value={n.calories} unit="" />
              </div>
              <p className="mt-2 text-xs text-gray-500">Estimated values per serving.</p>
            </section>

            <section aria-labelledby="ingredients-heading" className="rounded-3xl border border-gray-200 bg-white p-6">
              <h2 id="ingredients-heading" className="text-xl font-bold text-gray-900">Ingredients</h2>
              <ul className="mt-4 space-y-2">
                {ingredients.map((item, i) => (
                  <li key={`${item.name}-${i}`} className="flex gap-3 text-gray-800">
                    <span className="mt-2 h-2 w-2 flex-none rounded-full bg-teal-600" aria-hidden="true" />
                    <span>{ingredientText(item)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="method-heading">
              <h2 id="method-heading" className="text-xl font-bold text-gray-900">Method</h2>
              <ol className="mt-4 space-y-4">
                {steps.map((text, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{i + 1}</span>
                    <p className="pt-1 leading-7 text-gray-800">{text}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-3xl bg-gradient-to-br from-teal-800 to-emerald-700 p-6 text-white md:p-8">
              <h2 className="text-2xl font-bold">Make it fit your blood sugar goals</h2>
              <p className="mt-2 text-teal-50/90">
                In the GlucoForager app you can save this recipe, add it to your shopping list, cook it step by step and log
                your glucose after eating to see how it affects <em>you</em>. Or snap your fridge and get recipes from what you already have.
              </p>
              <Link href="/download" className="mt-5 inline-flex rounded-full bg-white px-6 py-3 font-semibold text-teal-800 hover:bg-teal-50">
                Get GlucoForager free
              </Link>
            </section>

            <p className="text-sm leading-6 text-gray-500">
              This recipe is general guidance, not medical advice. Carb needs depend on your treatment and goals, so check with
              your doctor, diabetes nurse or dietitian if you're unsure.
            </p>
          </article>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <AppDownloadCard />
            {recipe.related?.length ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-bold text-gray-900">More {meal.toLowerCase()} ideas</h2>
                <ul className="mt-4 space-y-4">
                  {recipe.related.map((r) => (
                    <li key={r.id}>
                      <Link href={`/recipes/${r.slug}`} className="group flex gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolveImage(r.image_url)} alt="" loading="lazy" className="h-16 w-16 flex-none rounded-xl object-cover" />
                        <span>
                          <span className="block font-semibold leading-snug text-gray-900 group-hover:text-teal-800">{r.name}</span>
                          {r.carbs != null ? <span className="text-sm text-gray-500">{round(r.carbs)}g carbs</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/recipes" className="mt-4 inline-block font-semibold text-teal-700 hover:text-teal-900">All recipes →</Link>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}
