'use client';

export default function LoadingState({ label }) {
  return (
    <div className="admin-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="admin-spinner" aria-hidden="true" />
      <div>
        <p className="admin-loading-title">{label || 'Loading…'}</p>
        <div className="admin-skeleton">
          <div className="admin-skeleton-line" />
          <div className="admin-skeleton-line" />
          <div className="admin-skeleton-line short" />
        </div>
      </div>
    </div>
  );
}

