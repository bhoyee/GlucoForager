import HeroSection from "../components/HeroSection";
import FeatureGrid from "../components/FeatureGrid";
import PricingTable from "../components/PricingTable";
import ScreenshotGallery from "../components/ScreenshotGallery";
import Testimonials from "../components/Testimonials";
import FAQ from "../components/FAQ";

export default function HomePage() {
  return (
    <main className="container mx-auto max-w-6xl space-y-16 px-4 py-10">
      <HeroSection />

      <section className="space-y-4">
        <h2 className="text-3xl font-bold">How it works</h2>
        <FeatureGrid />
      </section>

      <section className="space-y-4">
        <h2 className="text-3xl font-bold">Feature comparison</h2>
        <PricingTable />
      </section>

      <section className="space-y-4" id="gallery">
        <h2 className="text-3xl font-bold">Screenshot gallery</h2>
        <ScreenshotGallery />
      </section>

      <section className="space-y-4">
        <h2 className="text-3xl font-bold">What people say</h2>
        <Testimonials />
      </section>

      <section className="space-y-4" id="pricing">
        <h2 className="text-3xl font-bold">Pricing</h2>
        <PricingTable />
        <p className="text-slate-300">Premium is £2.99/month with a 7-day free trial.</p>
      </section>

      <section className="space-y-4" id="faq">
        <h2 className="text-3xl font-bold">FAQ</h2>
        <FAQ />
      </section>

      <footer
        id="download"
        className="flex flex-col gap-4 rounded-3xl border border-slate-700 bg-surface/60 p-6 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h3 className="text-2xl font-semibold">Download GlucoForager</h3>
          <p className="text-slate-300">Mobile-first, optimized for diabetes-friendly meal planning.</p>
        </div>
        <div className="flex gap-3">
          <a className="rounded-xl bg-black px-4 py-3 text-white" href="#">
            App Store
          </a>
          <a className="rounded-xl bg-black px-4 py-3 text-white" href="#">
            Google Play
          </a>
        </div>
      </footer>
    </main>
  );
}
