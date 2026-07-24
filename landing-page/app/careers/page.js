import Header from "../../components/Header";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");
const APPLY_EMAIL = "hello@glucoforager.com";

export const metadata = {
  title: "Careers",
  description:
    "Join GlucoForager. We're hiring a remote Digital Marketer and a Recipe Content & Data Specialist to help build a better diabetes-friendly food assistant.",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers at GlucoForager",
    description:
      "We're hiring a remote Digital Marketer and a Recipe Content & Data Specialist. See the roles and how to apply.",
    url: `${SITE_URL}/careers`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

const roles = [
  {
    id: "digital-marketer",
    title: "Digital Marketer",
    meta: "Remote · Full-time",
    summary:
      "Own GlucoForager's presence across social media and digital marketing, growing awareness of the app and building a community around diabetes-friendly eating.",
    responsibilities: [
      "Plan, create, and publish content across Facebook, Instagram, X, TikTok, Bluesky, and our WhatsApp Channel",
      "Build and manage a content calendar aligned with product updates, blog posts, and app milestones",
      "Grow and engage our community — respond to comments and messages, and build relationships with diabetes and healthy-eating audiences",
      "Run and optimise paid social and app-install campaigns where relevant",
      "Write and edit marketing copy for social posts, email newsletters, and landing page updates",
      "Track performance (reach, engagement, followers, app installs) and report on what's working",
      "Collaborate with the product team on launch campaigns, blog content, and email newsletters",
      "Keep GlucoForager's brand voice consistent — clear, supportive, and evidence-aware (not medical advice) — across every channel",
    ],
    requirements: [
      "Proven experience running social media accounts and digital marketing campaigns, ideally for an app, health, or consumer brand",
      "Strong writing skills and a good eye for visual content",
      "Comfortable using scheduling and analytics tools (e.g. Meta Business Suite, TikTok/X analytics)",
      "A self-starter who can work independently as part of a small, remote team",
    ],
    niceToHave: [
      "Experience running paid ads (Meta Ads, TikTok Ads, Google App Campaigns)",
      "Basic graphic design skills (Canva, Figma, or similar)",
      "Experience with email marketing tools",
      "Interest in health, nutrition, or diabetes-friendly living",
    ],
  },
  {
    id: "recipe-content-data-specialist",
    title: "Recipe Content & Data Specialist",
    meta: "Remote · Full-time",
    summary:
      "Own the day-to-day creation and upkeep of GlucoForager's recipe library — entering, organising, and quality-checking recipes so every user gets accurate, diabetes-friendly meal ideas.",
    responsibilities: [
      "Create and enter new recipes into GlucoForager's admin system (ingredients, instructions, nutrition facts, images, and tags)",
      "Review and edit AI-generated recipes for accuracy, clarity, and diabetes-friendliness before they go live",
      "Keep the recipe library organised — categorise, tag, and update recipes so they're easy to find and recommend",
      "Check nutrition data (calories, carbs, protein, fibre) for accuracy and consistency across recipes",
      "Spot and fix duplicate, outdated, or low-quality entries",
      "Work with the team to fill gaps in the recipe library, such as more breakfast, snack, or low-carb options",
      "Maintain a high standard of data accuracy and consistency across the whole catalogue",
    ],
    requirements: [
      "Strong attention to detail and comfort working inside an admin dashboard or content management system",
      "Good written English and comfortable following a consistent style and format for recipes",
      "Organised and reliable — this role is about consistency over time, not one-off tasks",
      "No coding required — full training is given on our recipe admin tools",
    ],
    niceToHave: [
      "Experience with data entry, content moderation, or content management systems",
      "Background in nutrition, dietetics, culinary arts, or recipe writing",
      "Familiarity with diabetes-friendly or low-glycemic eating",
    ],
  },
];

export default function CareersPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-20">
      <div className="container mx-auto max-w-5xl px-4 py-12 space-y-12">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800">
            We&apos;re hiring
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900">Careers at GlucoForager</h1>
          <p className="text-gray-600 max-w-2xl">
            We&apos;re a small, remote team building a daily diabetes food assistant that helps people decide what to
            eat without guessing. If you want your work to have a real, everyday impact on people managing their
            health, we&apos;d love to hear from you.
          </p>
        </header>

        <section className="space-y-8">
          {roles.map((role) => (
            <article key={role.id} id={role.id} className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{role.title}</h2>
                <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-100 px-3 py-1 text-sm font-semibold text-teal-700">
                  {role.meta}
                </span>
              </div>

              <p className="mt-4 text-gray-700 leading-7">{role.summary}</p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">What you&apos;ll do</h3>
                  <ul className="mt-3 list-disc pl-5 space-y-2 text-gray-700">
                    {role.responsibilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">What we&apos;re looking for</h3>
                    <ul className="mt-3 list-disc pl-5 space-y-2 text-gray-700">
                      {role.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">Nice to have</h3>
                    <ul className="mt-3 list-disc pl-5 space-y-2 text-gray-700">
                      {role.niceToHave.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">How to apply:</span> Send your CV to{' '}
                  <a href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(role.title)}`} className="text-teal-700 font-semibold hover:text-teal-900">
                    {APPLY_EMAIL}
                  </a>{' '}
                  with &quot;{role.title}&quot; in the subject line.
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
          <h2 className="text-lg font-bold text-gray-900">Don&apos;t see a fit?</h2>
          <p className="mt-2 text-gray-600">
            We&apos;re always open to hearing from people who care about food and health tech. Email us at{' '}
            <a href={`mailto:${APPLY_EMAIL}`} className="text-teal-700 font-semibold hover:text-teal-900">
              {APPLY_EMAIL}
            </a>{' '}
            and tell us how you could help.
          </p>
        </section>
      </div>
      </main>
    </>
  );
}
