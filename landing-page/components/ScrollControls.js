'use client';

import { useEffect, useState } from 'react';

export default function ScrollControls() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 200);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollBottom = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });

  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-24 z-[60] flex flex-col gap-2">
      <button
        type="button"
        onClick={scrollTop}
        className="h-11 w-11 rounded-full bg-white shadow-lg border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        aria-label="Scroll to top"
        title="Scroll to top"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={scrollBottom}
        className="h-11 w-11 rounded-full bg-white shadow-lg border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        aria-label="Scroll to bottom"
        title="Scroll to bottom"
      >
        ↓
      </button>
    </div>
  );
}

