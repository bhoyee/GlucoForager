import FeatureGrid from "../../components/FeatureGrid";

export default function FeaturesPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-10 space-y-10">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold">Built for diabetes-safe cooking</h1>
        <p className="text-slate-300">Ingredient-level filtering, low-glycemic scoring, and crystal-clear nutrition.</p>
      </header>
      <FeatureGrid />
    </main>
  );
}
