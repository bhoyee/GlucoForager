'use client';

import { useEffect, useRef, useState } from 'react';

// Admin-wide confirmation dialog, used instead of window.confirm.
//
//   if (!(await confirmDialog({ title: 'Delete this tip?', confirmLabel: 'Delete', tone: 'danger' }))) return;
//
// <ConfirmDialogHost /> is mounted once in AdminShell; confirmDialog() resolves true (confirmed) or false.

let showDialog = null;
const pending = [];

export function confirmDialog(options = {}) {
  const request = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    if (!showDialog) {
      // Host not mounted (should not happen inside the admin); fall back to the browser dialog.
      resolve(window.confirm([request.title, request.message].filter(Boolean).join('\n\n')));
      return;
    }
    pending.push({ ...request, resolve });
    showDialog();
  });
}

const ICONS = {
  danger: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  default: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
};

export function ConfirmDialogHost() {
  const [current, setCurrent] = useState(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    showDialog = () => setCurrent((open) => open || pending[0] || null);
    return () => {
      showDialog = null;
    };
  }, []);

  const close = (result) => {
    const item = pending.shift();
    item?.resolve(result);
    setCurrent(pending[0] || null);
  };

  useEffect(() => {
    if (!current) return undefined;
    // Destructive actions focus Cancel so a stray Enter doesn't delete anything.
    (current.tone === 'danger' ? cancelRef : confirmRef).current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;

  const tone = current.tone || 'default';
  const title = current.title || 'Are you sure?';
  return (
    <div className="admin-confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div
        className={`admin-confirm admin-confirm--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby={current.message ? 'admin-confirm-message' : undefined}
      >
        <div className="admin-confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[tone] || ICONS.default}
          </svg>
        </div>
        <h3 id="admin-confirm-title" className="admin-confirm-title">
          {title}
        </h3>
        {current.message ? (
          <p id="admin-confirm-message" className="admin-confirm-message">
            {current.message}
          </p>
        ) : null}
        <div className="admin-confirm-actions">
          <button ref={cancelRef} type="button" className="admin-confirm-button" onClick={() => close(false)}>
            {current.cancelLabel || 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`admin-confirm-button admin-confirm-button--${tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={() => close(true)}
          >
            {current.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
