import FeatureGrid from "../../components/FeatureGrid";
import Header from "../../components/Header";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");

export const metadata = {
  title: "Features",
  description:
    "See what GlucoForager can do: scan a barcode or food photo for an instant diabetes-friendly verdict, log glucose and carbs, get personalised meal ideas, and more.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "GlucoForager Features — Food Scanning, Glucose Tracking & Meal Ideas",
    description:
      "Scan any food or barcode for a diabetes-friendly verdict, track glucose and your daily carb goal, and get diabetes-aware meal ideas built around your blood sugar goals.",
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
          Scan any food or barcode for an instant diabetes-friendly verdict, track your glucose and daily carb goal,
          and get practical meal ideas, swaps, shopping lists, and meal plans to build steadier habits.
        </p>
      </header>
      <FeatureGrid />
      </div>
      </main>
    </>
  );
}
