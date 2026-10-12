import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");
const APPLY_EMAIL = "hello@glucoforager.com";

export const metadata = {
  title: "Careers",
  description:
    "Join GlucoForager. We're looking for a Growth & Community co-founder, plus a remote Digital Marketer and a Recipe Content & Data Specialist, to help build a better diabetes-friendly food assistant.",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers at GlucoForager",
    description:
      "We're looking for a Growth & Community co-founder, and hiring a remote Digital Marketer and a Recipe Content & Data Specialist. See the roles and how to apply.",
    url: `${SITE_URL}/careers`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

const cofounder = {
  id: "cofounder",
  title: "Co-founder: Growth & Community",
  meta: "Remote · Anywhere · Full-time",
  pitch:
    "GlucoForager is live on the App Store and Google Play, helping people with diabetes decide what to eat without guessing. The product is built and growing, and the founder handles all engineering. We're looking for a co-founder to own everything else: getting GlucoForager into the hands of the people who need it, and building the company alongside us.",
  own: [
    "Growth and business development: partnerships with diabetes charities, clinics, dietitians, and health brands",
    "Community and social media: building GlucoForager's voice and audience on TikTok, Instagram, and in diabetes communities",
    "Creator and influencer relationships, including being a public face of the brand if you want to be",
    "User insight: talking to users every week and turning what you learn into product direction",
    "Company strategy, fundraising, and future hiring, as an equal partner in the big decisions",
  ],
  lookingFor: [
    "You've built an audience or community, or brought in customers or partners, and can show it",
    "You're comfortable pitching, selling, and starting conversations with people you don't know yet",
    "You're self-driven and want ownership of an outcome, not a list of tasks",
    "You can commit to GlucoForager as your main focus",
  ],
  livedExperience:
    "Lived experience of diabetes, as someone living with it or caring for someone who is, is a big plus. You'll understand our users in a way no research can. It's never a requirement, and you don't need to share anything you'd rather keep private.",
  split: {
    you: ["Growth and user acquisition", "Community and social media", "Partnerships and business development", "Brand voice and storytelling"],
    founder: ["Product and engineering", "Mobile app and backend", "AI features and data", "Infrastructure and security"],
  },
  deal: [
    { label: "Equity", text: "A meaningful co-founder stake, with standard vesting so it's fair to both of us." },
    { label: "Pay", text: "Equity only for now. Salaries start once GlucoForager brings in revenue or funding." },
    { label: "Commitment", text: "Full-time ownership of your area, with flexible hours. You're welcome to keep your own business or other income while we're pre-revenue; just be open about it." },
    { label: "Location", text: "Fully remote. Anywhere in the world." },
  ],
  apply: [
    "A short intro: who you are, and why GlucoForager",
    "Links to your audience or past work (social profiles, communities, campaigns, partnerships)",
    "Your answer to one question: how would you get GlucoForager its first 1,000 active users?",
  ],
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
        <Link href="/" className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 font-semibold text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
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

        <section
          id={cofounder.id}
          aria-labelledby="cofounder-title"
          className="rounded-2xl border-2 border-teal-200 bg-gradient-to-b from-teal-50 to-white p-6 md:p-8 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <span className="inline-flex items-center rounded-full bg-teal-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Co-founder opportunity
              </span>
              <h2 id="cofounder-title" className="text-2xl md:text-3xl font-extrabold text-gray-900">
                {cofounder.title}
              </h2>
            </div>
            <span className="inline-flex items-center rounded-full bg-white border border-teal-200 px-3 py-1 text-sm font-semibold text-teal-700">
              {cofounder.meta}
            </span>
          </div>

          <p className="mt-4 text-gray-700 leading-7">{cofounder.pitch}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">What you&apos;ll own</h3>
              <ul className="mt-3 list-disc pl-5 space-y-2 text-gray-700">
                {cofounder.own.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">Who we&apos;re looking for</h3>
              <ul className="mt-3 list-disc pl-5 space-y-2 text-gray-700">
                {cofounder.lookingFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-gray-800 leading-6">
              <span className="font-semibold text-gray-900">Big plus:</span> {cofounder.livedExperience}
            </p>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">How we split the work</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-teal-200 bg-white p-4">
                <p className="font-bold text-teal-800">You</p>
                <ul className="mt-2 space-y-1 text-gray-700">
                  {cofounder.split.you.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="font-bold text-gray-900">The founder</p>
                <ul className="mt-2 space-y-1 text-gray-700">
                  {cofounder.split.founder.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">The deal</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {cofounder.deal.map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
                  <dt className="font-bold text-gray-900">{item.label}</dt>
                  <dd className="mt-1 text-sm text-gray-700 leading-6">{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">How to apply</p>
            <p className="mt-1 text-sm text-gray-700">
              No CV needed. Email{' '}
              <a
                href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent("Co-founder: Growth & Community")}`}
                className="text-teal-700 font-semibold hover:text-teal-900"
              >
                {APPLY_EMAIL}
              </a>{' '}
              with &quot;Co-founder&quot; in the subject line, and include:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-700">
              {cofounder.apply.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-bold text-gray-900">Open roles</h2>
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
      <Footer />
    </>
  );
}
