'use client';

import { useEffect } from 'react';

export default function BlogImageFallback() {
  useEffect(() => {
    const images = Array.from(document.querySelectorAll('img[data-gf-fallback-src]'));
    if (!images.length) return;

    const detach = [];
    images.forEach((img) => {
      const fallback = img.getAttribute('data-gf-fallback-src') || '';
      if (!fallback) return;

      const handler = () => {
        try {
          if (!fallback) return;
          if (img.src === fallback) return;
          img.src = fallback;
        } catch {
          // ignore
        }
      };

      img.addEventListener('error', handler);
      detach.push(() => img.removeEventListener('error', handler));
    });

    return () => detach.forEach((fn) => fn());
  }, []);

  return null;
}

