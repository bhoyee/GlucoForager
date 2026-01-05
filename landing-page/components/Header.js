"use client";


import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';


export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll for header background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm' 
        : 'bg-white/90 backdrop-blur'
    }`}>
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          {/* Logo */}
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
          <span className="text-xl font-bold text-gray-900">GlucoForager</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
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
          <a href="#contact" className="text-gray-600 hover:text-teal-600 transition-colors">
            Contact
          </a>
        </nav>
        
        <div className="flex items-center gap-3">
          <a 
            href="#pricing" 
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            Download Free
          </a>
          
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-gray-600 hover:text-teal-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
          <div className="container mx-auto px-4 py-4 space-y-1">
            <a
              href="#features"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 text-gray-700 hover:text-teal-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Features
            </a>
            <a
              href="#screenshots"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 text-gray-700 hover:text-teal-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Screenshots
            </a>
            <a
              href="#pricing"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 text-gray-700 hover:text-teal-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 text-gray-700 hover:text-teal-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              FAQ
            </a>
            <a
              href="#contact"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 text-gray-700 hover:text-teal-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Contact
            </a>
            <a
              href="#pricing"
              onClick={() => setIsMenuOpen(false)}
              className="block py-3 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-center mt-2"
            >
              Download Free
            </a>
          </div>
        </div>
      )}
    </header>
  );
}