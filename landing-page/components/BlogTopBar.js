import Link from 'next/link';
import Image from 'next/image';

export default function BlogTopBar({ rightHref = '/', rightLabel = 'Back to home' }) {
  return (
    <header className="w-full bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="container mx-auto max-w-6xl flex h-20 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-10 w-10">
            <Image
              src="/images/logo.png"
              alt="GlucoForager Logo"
              width={40}
              height={40}
              className="object-contain"
              priority
            />
          </div>
          <span className="text-xl font-bold text-gray-900 whitespace-nowrap">GlucoForager</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/#features" className="text-gray-600 hover:text-teal-600 transition-colors">
            Features
          </Link>
          <Link href="/#faq" className="text-gray-600 hover:text-teal-600 transition-colors">
            FAQ
          </Link>
          <Link href="/blog" className="text-gray-600 hover:text-teal-600 transition-colors">
            Blog
          </Link>
          <Link href="/#contact" className="text-gray-600 hover:text-teal-600 transition-colors">
            Contact
          </Link>
        </nav>

        {rightHref ? (
          <Link
            href={rightHref}
            className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-2.5 text-white font-semibold shadow-sm hover:bg-teal-700 transition-colors"
          >
            {rightLabel}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
