import PricingTable from "../../components/PricingTable";

export default function PricingPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold">Clear, fair pricing</h1>
        <p className="text-slate-300">Free for 3 searches/day, or go premium for the full camera-powered experience.</p>
      </header>
      <PricingTable />
    </main>
  );
}
