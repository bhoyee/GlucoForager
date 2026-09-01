'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

// Adds a `width` attribute (rendered as inline style, so it survives into the saved
// HTML and the public blog page) and a custom NodeView with a drag handle so images
// can be resized directly in the editor, the way a normal rich editor works.
function ResizableImageView({ node, updateAttributes, selected }) {
  const wrapperRef = useRef(null);

  const startResize = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const imgEl = wrapperRef.current?.querySelector('img');
      if (!imgEl) return;
      const startX = event.clientX;
      const startWidth = imgEl.getBoundingClientRect().width;
      const containerWidth = wrapperRef.current?.parentElement?.getBoundingClientRect().width || startWidth;

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.round(Math.max(80, Math.min(startWidth + delta, containerWidth)));
        updateAttributes({ width: `${nextWidth}px` });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      style={{ display: 'inline-block', maxWidth: '100%', position: 'relative', lineHeight: 0 }}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || ''}
        draggable={false}
        style={{
          width: node.attrs.width || 'auto',
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          margin: '12px auto',
          borderRadius: '12px',
          outline: selected ? '2px solid #0FB7A5' : 'none',
          outlineOffset: '2px',
        }}
      />
      {selected ? (
        <span
          onPointerDown={startResize}
          contentEditable={false}
          title="Drag to resize"
          style={{
            position: 'absolute',
            right: 4,
            bottom: 16,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#0FB7A5',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            cursor: 'nwse-resize',
          }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.style.width || element.getAttribute('width') || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}; max-width: 100%; height: auto;` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

const getUpgradedApiBase = () => {
  let base = API_BASE;
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && base.startsWith('http://')) {
      base = `https://${base.slice('http://'.length)}`;
    }
  } catch {
    // ignore
  }
  return base;
};

const rewriteUploadsInHtml = (html) => {
  const source = String(html || '');
  if (!source) return '';

  const apiBase = getUpgradedApiBase();

  const rewrite = (src) => {
    const url = String(src || '').trim();
    if (!url) return url;
    if (url.startsWith('data:')) return url;

    // Accept existing absolute `/api/uploads/...` and `/uploads/...` (any host) and normalize to our API base.
    const relApiUploads = url.match(/^(\/api\/uploads\/.+)$/i);
    if (relApiUploads) return `${apiBase}${relApiUploads[1]}`;

    const relUploads = url.match(/^(\/uploads\/.+)$/i);
    if (relUploads) return `${apiBase}/api${relUploads[1]}`;

    const absApiUploads = url.match(/^https?:\/\/[^/]+(\/api\/uploads\/.+)$/i);
    if (absApiUploads) return `${apiBase}${absApiUploads[1]}`;

    const absUploads = url.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i);
    if (absUploads) return `${apiBase}/api${absUploads[1]}`;

    // Keep external images unchanged.
    return url;
  };

  return source.replace(/(<img[^>]+src=['"])([^'"]+)(['"][^>]*>)/gi, (_m, p1, src, p3) => {
    return `${p1}${rewrite(src)}${p3}`;
  });
};

const normalizeUploadUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (!value.startsWith('/')) return value;

  // If the site is served over HTTPS but NEXT_PUBLIC_API_URL is accidentally HTTP,
  // browsers will block images as mixed content. In production our API should be HTTPS,
  // so we "upgrade" here for rendering + persistence.
  const base = getUpgradedApiBase();

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
      ResizableImage.configure({
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
    content: rewriteUploadsInHtml(value),
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
          if (file) {
            event.preventDefault();
            void handleFileChosen(file);
            return true;
          }
          // Fallback: some sources (e.g. copying an image from a webpage) put HTML with
          // an <img src="..."> on the clipboard instead of a raw file item. Embed that
          // image by URL directly, same as the excerpt editor already does.
          const html = event?.clipboardData?.getData?.('text/html') || '';
          if (typeof html === 'string' && html.includes('<img')) {
            const match = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
            const src = match?.[1] ? String(match[1]).trim() : '';
            if (src && editor) {
              event.preventDefault();
              editor.chain().focus().setImage({ src }).run();
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      },
    },
  });

  // Keep editor in sync when loading an existing post (value changes from outside).
  useEffect(() => {
    if (!editor) return;
    const next = rewriteUploadsInHtml(value);
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

      <div className="gf-toolbar">
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('bold') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!can(() => editor.can().chain().focus().toggleBold().run())}
          title="Bold"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('italic') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!can(() => editor.can().chain().focus().toggleItalic().run())}
          title="Italic"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('underline') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <u>U</u>
        </button>

        <span className="gf-toolbar-divider" />

        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('heading', { level: 1 }) ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('heading', { level: 2 }) ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('heading', { level: 3 }) ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          H3
        </button>

        <span className="gf-toolbar-divider" />

        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('bulletList') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          • List
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('orderedList') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          1. List
        </button>
        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('blockquote') ? ' is-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          " Quote
        </button>

        <span className="gf-toolbar-divider" />

        <button
          type="button"
          className={`gf-toolbar-btn${editor.isActive('link') ? ' is-active' : ''}`}
          onClick={setLink}
          title="Link"
        >
          🔗 Link
        </button>
        <button
          type="button"
          className="gf-toolbar-btn"
          onClick={triggerImagePicker}
          disabled={!adminToken || uploadBusy}
          title="Insert image"
        >
          🖼 Image
        </button>
        <button
          type="button"
          className="gf-toolbar-btn"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Clear formatting"
        >
          Clear
        </button>

        <span className="gf-toolbar-divider" />

        <button
          type="button"
          className="gf-toolbar-btn"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!can(() => editor.can().chain().focus().undo().run())}
          title="Undo"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="gf-toolbar-btn"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!can(() => editor.can().chain().focus().redo().run())}
          title="Redo"
        >
          ↷ Redo
        </button>

        {uploadBusy ? <span className="gf-toolbar-status">Uploading image…</span> : null}
        {!uploadBusy && uploadError ? <span className="gf-toolbar-status gf-toolbar-status--error">{uploadError}</span> : null}
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
        .gf-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          padding: 8px 10px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        .gf-toolbar-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 30px;
          height: 30px;
          padding: 0 9px;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          color: #374151;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .gf-toolbar-btn:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
        .gf-toolbar-btn:active:not(:disabled) {
          background: #e5e7eb;
        }
        .gf-toolbar-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .gf-toolbar-btn.is-active {
          background: #0fb7a5;
          border-color: #0fb7a5;
          color: #ffffff;
        }
        .gf-toolbar-divider {
          width: 1px;
          height: 20px;
          background: #d1d5db;
          margin: 0 4px;
          flex-shrink: 0;
        }
        .gf-toolbar-status {
          margin-left: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
        }
        .gf-toolbar-status--error {
          color: #e11d48;
        }
      `}</style>
    </div>
  );
}
