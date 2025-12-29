export default function DownloadPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
      <h1 className="text-4xl font-bold">Get GlucoForager</h1>
      <p className="text-slate-300">Mobile-first app for diabetes-friendly recipe matching.</p>
      <div className="flex gap-3">
        <a className="rounded-xl bg-black px-4 py-3 text-white" href="#">
          App Store
        </a>
        <a className="rounded-xl bg-black px-4 py-3 text-white" href="#">
          Google Play
        </a>
      </div>
    </main>
  );
}
