import Link from 'next/link';

export default function Header() {
  // Use regular <a> tags for anchor links, not Next.js <Link>
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-purple-600" />
          <span className="text-xl font-bold text-gray-900">GlucoForager</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          {/* Use regular <a> tags for anchor links */}
          <a href="#features" className="text-gray-600 hover:text-teal-600 transition-colors">
            Features
          </a>
          <a href="#screenshots" className="text-gray-600 hover:text-teal-600 transition-colors">
            Screenshots
          </a>
          <a href="#pricing" className="text-gray-600 hover:text-teal-600 transition-colors">
            Pricing
          </a>
          <a href="#faq" className="text-gray-600 hover:text-teal-600 transition-colors">
            FAQ
          </a>
        </nav>
        
        <div className="flex items-center gap-3">
          <a 
            href="#pricing" 
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            Download Free
          </a>
        </div>
      </div>
    </header>
  );
}