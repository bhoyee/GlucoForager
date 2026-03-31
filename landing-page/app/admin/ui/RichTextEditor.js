'use client';

import { useEffect, useRef } from 'react';

const TOOLBAR = [
  { cmd: 'bold', label: 'B' },
  { cmd: 'italic', label: 'I' },
  { cmd: 'underline', label: 'U' },
  { cmd: 'insertUnorderedList', label: '• List' },
];

export default function RichTextEditor({ value, onChange, placeholder = 'Write your message…', minHeight = 180 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Keep editor content in sync (only when it differs to preserve cursor).
    const next = String(value || '');
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  const exec = (cmd) => {
    try {
      document.execCommand(cmd, false, null);
      const el = ref.current;
      if (el && onChange) onChange(el.innerHTML);
    } catch {
      // ignore
    }
  };

  const addLink = () => {
    const url = window.prompt('Enter link URL (https://...)');
    if (!url) return;
    try {
      document.execCommand('createLink', false, url);
      const el = ref.current;
      if (el && onChange) onChange(el.innerHTML);
    } catch {
      // ignore
    }
  };

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    onChange?.(el.innerHTML);
  };

  return (
    <div>
      <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {TOOLBAR.map((t) => (
            <button key={t.cmd} className="admin-button secondary" type="button" onClick={() => exec(t.cmd)} style={{ padding: '8px 12px' }}>
              {t.label}
            </button>
          ))}
          <button className="admin-button secondary" type="button" onClick={addLink} style={{ padding: '8px 12px' }}>
            Link
          </button>
          <span className="admin-subtitle" style={{ marginLeft: 8 }}>
            (Rich text)
          </span>
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
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
          background: '#fff',
        }}
      />
      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </div>
  );
}

