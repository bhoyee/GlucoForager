export default function BlogPost({ params }) {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-10 space-y-4">
      <p className="badge">Blog</p>
      <h1 className="text-4xl font-bold capitalize">{params.slug.replace(/-/g, ' ')}</h1>
      <p className="text-slate-300">
        Coming soon: deep dives on low-glycemic cooking, ingredient safety, and living well with Type 2 Diabetes.
      </p>
    </main>
  );
}
