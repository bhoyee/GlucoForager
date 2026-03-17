import FeatureGrid from "../../components/FeatureGrid";

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto max-w-5xl px-4 py-12 space-y-10">
      <header className="space-y-3">
        <h1 className="text-4xl font-extrabold text-gray-900">What you can do with GlucoForager</h1>
        <p className="text-gray-600">
          Scan ingredients, get practical meal ideas, and build steadier habits with tips, challenges, swaps, and meal
          plans.
        </p>
      </header>
      <FeatureGrid />
      </div>
    </main>
  );
}
