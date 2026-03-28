'use client';

export default function EmptyState({ title, body, children }) {
  return (
    <div className="admin-empty">
      <div className="admin-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a4 4 0 0 1-4 4H7a4 4 0 0 1 0-8h1" />
          <path d="M7 11a5 5 0 0 1 10 0" />
        </svg>
      </div>
      <div className="admin-empty-content">
        <h3 className="admin-empty-title">{title || 'Nothing here yet'}</h3>
        {body ? <p className="admin-empty-body">{body}</p> : null}
        {children ? <div className="admin-empty-actions">{children}</div> : null}
      </div>
    </div>
  );
}

