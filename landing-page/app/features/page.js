import FeatureGrid from "../../components/FeatureGrid";
import Header from "../../components/Header";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");

export const metadata = {
  title: "Features",
  description:
    "See what GlucoForager can do: scan or type ingredients for diabetes-friendly meal ideas, get food swaps, daily tips and challenges, and a Premium daily meal planner.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "GlucoForager Features — Meal Ideas, Swaps & Daily Planning",
    description:
      "Scan ingredients, get diabetes-aware meal ideas, smarter food swaps, and a Premium daily meal planner built around your blood sugar goals.",
    url: `${SITE_URL}/features`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-20">
      <div className="container mx-auto max-w-5xl px-4 py-12 space-y-10">
      <header className="space-y-3">
        <h1 className="text-4xl font-extrabold text-gray-900">What you can do with GlucoForager</h1>
        <p className="text-gray-600">
          Scan ingredients, get practical meal ideas, and build steadier habits with tips, challenges, swaps, shopping
          lists, and meal plans.
        </p>
      </header>
      <FeatureGrid />
      </div>
      </main>
    </>
  );
}
