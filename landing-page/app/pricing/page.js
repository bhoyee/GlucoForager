import PricingTable from "../../components/PricingTable";
import Header from "../../components/Header";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");

export const metadata = {
  title: "Pricing",
  description:
    "GlucoForager pricing: start free with limited AI scans and recipes, or go Premium for higher usage limits and the Daily Meal Planner.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "GlucoForager Pricing — Free & Premium Plans",
    description:
      "Clear, fair pricing for diabetes-friendly meal planning. Start free, no credit card required, or upgrade to Premium for the Daily Meal Planner.",
    url: `${SITE_URL}/pricing`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-20">
      <div className="container mx-auto max-w-5xl px-4 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900">Clear, fair pricing</h1>
          <p className="text-gray-600">
            Browse recipes, tips, and the daily challenge free, no trial needed. Start your 7-day free trial to
            unlock AI recipe generation, or go Premium for higher usage limits and the Daily Meal Planner.
          </p>
        </header>
        <PricingTable />
      </div>
      </main>
    </>
  );
}
