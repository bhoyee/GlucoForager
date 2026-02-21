'use client';

import { useMemo, useState } from 'react';

export default function BlogShare({ title, url }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = useMemo(() => encodeURIComponent(url || ''), [url]);
  const encodedText = useMemo(() => encodeURIComponent(title || ''), [title]);

  const shareLinks = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Ignore.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-gray-700">Share:</span>
      {shareLinks.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-teal-700 hover:text-teal-900 font-semibold"
        >
          {item.label}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        className="text-sm text-gray-700 hover:text-gray-900 font-semibold"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

