'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

const normalizeUploadUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (!value.startsWith('/')) return value;

  // If the site is served over HTTPS but NEXT_PUBLIC_API_URL is accidentally HTTP,
  // browsers will block images as mixed content. In production our API should be HTTPS,
  // so we "upgrade" here for rendering + persistence.
  let base = API_BASE;
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && base.startsWith('http://')) {
      base = `https://${base.slice('http://'.length)}`;
    }
  } catch {
    // ignore
  }

  // Normalize legacy `/uploads/...` to `/api/uploads/...` so it works behind proxies that only expose `/api/*`.
  const normalizedPath = value.startsWith('/uploads/') ? `/api${value}` : value;
  return `${base}${normalizedPath}`;
};

export default function AdminRichEditor({
  value,
  onChange,
  height = 520,
  placeholder = 'Write...',
  adminToken,
  readOnly = false,
}) {
  const fileInputRef = useRef(null);
  const lastSelectionRef = useRef(null);
  const lastValueRef = useRef(String(value || ''));
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        autolink: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ];
  }, [placeholder]);

  const editor = useEditor({
    editable: !readOnly,
    extensions,
    content: String(value || ''),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastValueRef.current = html;
      onChange?.(html);
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[120px] focus:outline-none px-3 py-3 prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2',
      },
      handlePaste: (_view, event) => {
        // Paste images from clipboard -> upload -> insert.
        try {
          if (readOnly) return false;
          if (!adminToken) return false;
          const items = event?.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
          const imgItem = items.find((it) => it && it.kind === 'file' && String(it.type || '').startsWith('image/'));
          const file = imgItem?.getAsFile?.() || null;
          if (!file) return false;
          event.preventDefault();
          void handleFileChosen(file);
          return true;
        } catch {
          return false;
        }
      },
    },
  });

  // Keep editor in sync when loading an existing post (value changes from outside).
  useEffect(() => {
    if (!editor) return;
    const next = String(value || '');
    if (next === lastValueRef.current) return;
    lastValueRef.current = next;
    try {
      editor.commands.setContent(next || '', false);
    } catch {
      // ignore
    }
  }, [editor, value]);

  const uploadImageFile = useCallback(
    async (file) => {
      if (!file) return '';
      if (!adminToken) return '';

      setUploadBusy(true);
      setUploadError('');
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_URL}/api/admin/blog/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = typeof data?.detail === 'string' ? data.detail : '';
          setUploadError(detail || `Upload failed (${response.status}).`);
          return '';
        }
        return normalizeUploadUrl(data?.url);
      } catch (e) {
        setUploadError(e?.message || 'Upload failed.');
        return '';
      } finally {
        setUploadBusy(false);
      }
    },
    [adminToken]
  );

  const handleFileChosen = useCallback(
    async (file) => {
      if (!editor) return;
      if (!file) return;
      if (!adminToken) return;
      if (uploadBusy) return;

      const selection = editor.state.selection;
      lastSelectionRef.current = selection ? { from: selection.from, to: selection.to } : null;

      const url = await uploadImageFile(file);
      if (!url) return;

      // Restore selection after file picker steals focus.
      const lastSel = lastSelectionRef.current;
      if (lastSel && typeof lastSel.from === 'number') {
        try {
          editor.commands.setTextSelection({ from: lastSel.from, to: lastSel.to ?? lastSel.from });
        } catch {
          // ignore
        }
      }

      editor.chain().focus().setImage({ src: url }).run();
    },
    [editor, adminToken, uploadBusy, uploadImageFile]
  );

  const triggerImagePicker = useCallback(() => {
    if (readOnly) return;
    if (!adminToken) return;
    if (!editor) return;
    if (uploadBusy) return;

    const selection = editor.state.selection;
    lastSelectionRef.current = selection ? { from: selection.from, to: selection.to } : null;

    const el = fileInputRef.current;
    if (!el) return;
    try {
      el.value = '';
    } catch {
      // ignore
    }
    el.click();
  }, [adminToken, editor, readOnly, uploadBusy]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link')?.href || '';
    const url = window.prompt('Paste link URL', previousUrl);
    if (url === null) return;
    if (String(url || '').trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const can = (fn) => {
    try {
      return editor ? fn() : false;
    } catch {
      return false;
    }
  };

  if (!editor) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">Loading editor…</div>
        <div style={{ height }} className="px-3 py-3 text-sm text-gray-500">
          Editor loading…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          void handleFileChosen(file);
        }}
      />

      <div className="border-b border-gray-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!can(() => editor.can().chain().focus().toggleBold().run())}
        >
          Bold
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!can(() => editor.can().chain().focus().toggleItalic().run())}
        >
          Italic
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          Underline
        </button>

        <span className="h-4 w-px bg-gray-200 mx-1" />

        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>

        <span className="h-4 w-px bg-gray-200 mx-1" />

        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbered
        </button>

        <span className="h-4 w-px bg-gray-200 mx-1" />

        <button type="button" className="admin-button !py-1 !px-2 !text-xs" onClick={setLink}>
          Link
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={triggerImagePicker}
          disabled={!adminToken || uploadBusy}
        >
          Image
        </button>
        <button
          type="button"
          className="admin-button !py-1 !px-2 !text-xs"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          Clear
        </button>

        {uploadBusy ? <span className="ml-2 text-xs font-semibold text-gray-500">Uploading image…</span> : null}
        {!uploadBusy && uploadError ? <span className="ml-2 text-xs font-semibold text-rose-600">{uploadError}</span> : null}
      </div>

      <div style={{ height }} className="overflow-auto">
        <EditorContent editor={editor} />
      </div>

      <style jsx>{`
        :global(.is-editor-empty:first-child::before) {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        :global(.ProseMirror img) {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 12px auto;
          border-radius: 12px;
        }
      `}</style>
    </div>
  );
}
