/* eslint-disable react/no-danger */
'use client';

import { useEffect, useRef } from 'react';

const TOOLBAR = [
  { cmd: 'bold', label: 'B' },
  { cmd: 'italic', label: 'I' },
  { cmd: 'underline', label: 'U' },
  { cmd: 'insertUnorderedList', label: '• Bullets' },
  { cmd: 'insertOrderedList', label: '1. List' },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your message…',
  minHeight = 180,
  readOnly = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = String(value || '');
    // Keep editor content in sync (only when it differs to preserve cursor).
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    onChange?.(el.innerHTML);
  };

  const exec = (cmd) => {
    try {
      const el = ref.current;
      if (el) el.focus();
      document.execCommand(cmd, false, null);
      commit();
    } catch {
      // ignore
    }
  };

  const addLink = () => {
    if (readOnly) return;
    const url = window.prompt('Enter link URL (https://...)');
    if (!url) return;
    try {
      const el = ref.current;
      if (el) el.focus();
      document.execCommand('createLink', false, url);
      commit();
    } catch {
      // ignore
    }
  };

  const handleInput = () => {
    if (readOnly) return;
    commit();
  };

  return (
    <div>
      <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {TOOLBAR.map((t) => (
            <button
              key={t.cmd}
              className="admin-button secondary"
              type="button"
              onMouseDown={(e) => {
                // Prevent button focus from stealing the current editor selection (lists won't apply otherwise).
                e.preventDefault();
                exec(t.cmd);
              }}
              style={{ padding: '8px 12px' }}
              disabled={readOnly}
            >
              {t.label}
            </button>
          ))}
          <button
            className="admin-button secondary"
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              addLink();
            }}
            style={{ padding: '8px 12px' }}
            disabled={readOnly}
          >
            Link
          </button>
          <span className="admin-subtitle" style={{ marginLeft: 8 }}>
            (Rich text)
          </span>
        </div>
      </div>

      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
        style={{
          minHeight,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.12)',
          padding: 12,
          outline: 'none',
          background: readOnly ? 'rgba(0,0,0,0.03)' : '#fff',
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      />

      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(0, 0, 0, 0.45);
        }
        [contenteditable] :global(ul),
        [contenteditable] :global(ol) {
          padding-left: 1.25rem;
          margin: 0.5rem 0;
        }
        [contenteditable] :global(li) {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
}

