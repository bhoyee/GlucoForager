'use client';

import { useMemo, useState } from 'react';

function CoverPlaceholder({ title, aspectClass, roundedClass, containerClassName }) {
  const firstLetter = useMemo(() => {
    const label = String(title || 'GF').trim();
    return label ? label[0].toUpperCase() : 'G';
  }, [title]);

  return (
    <div className={`relative overflow-hidden ${roundedClass} ${containerClassName}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-teal-700 via-emerald-600 to-cyan-600" />
      <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_30%_20%,white,transparent_55%)]" />
      <div className={`${aspectClass} flex items-center justify-center relative`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur border border-white/20">
          <span className="text-3xl font-extrabold text-white">{firstLetter}</span>
        </div>
      </div>
    </div>
  );
}

export default function BlogCoverImage({
  title,
  imageUrl,
  aspect = '16/9',
  roundedClass = 'rounded-xl',
  containerClassName = '',
  imageClassName = 'h-full w-full object-cover',
  imgProps = {},
}) {
  const [failed, setFailed] = useState(false);
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';

  const aspectClass = aspect === '16/7' ? 'aspect-[16/7]' : 'aspect-[16/9]';

  if (!url || failed) {
    return (
      <CoverPlaceholder
        title={title}
        aspectClass={aspectClass}
        roundedClass={roundedClass}
        containerClassName={containerClassName}
      />
    );
  }

  return (
    <div className={`relative overflow-hidden ${roundedClass} ${containerClassName}`}>
      <div className={aspectClass}>
        <img
          src={url}
          alt={title ? `${title} cover` : 'Post cover'}
          className={imageClassName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          {...imgProps}
        />
      </div>
    </div>
  );
}

