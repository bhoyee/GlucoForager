import PricingTable from "../../components/PricingTable";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto max-w-5xl px-4 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900">Clear, fair pricing</h1>
          <p className="text-gray-600">
            Start free, or go Premium for higher usage limits and the Daily Meal Planner.
          </p>
        </header>
        <PricingTable />
      </div>
    </main>
  );
}
