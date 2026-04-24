'use client';

import { useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

export default function AdminTinyEditor({
  value,
  onChange,
  height = 360,
  placeholder = '',
  compact = false,
  adminToken,
  readOnly = false,
}) {
  const rawToolbarId = useId();
  const toolbarId = useMemo(() => {
    // React's useId() can include ":" which is not a valid CSS selector in querySelector without escaping.
    // Quill uses querySelector internally for toolbar containers, so we normalize to a safe ID.
    const safe = String(rawToolbarId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return `gf-quill-${safe || 'toolbar'}`;
  }, [rawToolbarId]);
  const quillRef = useRef(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const toolbarConfig = useMemo(() => {
    if (compact) {
      return [['bold', 'italic', 'underline'], [{ list: 'bullet' }, { list: 'ordered' }], ['link'], ['clean']];
    }

    // Use a custom toolbar so we can add "image size" / "image align" controls.
    return `#${toolbarId}`;
  }, [compact, toolbarId]);

  const getQuill = () => quillRef.current?.getEditor?.() || null;

  const withSelectedImage = (fn) => {
    const quill = getQuill();
    if (!quill) return;
    const range = quill.getSelection(true);
    if (!range) return;

    const [leaf] = quill.getLeaf(range.index) || [];
    const node = leaf?.domNode;
    if (!node || String(node.tagName || '').toUpperCase() !== 'IMG') return;
    fn(node, quill, range);
  };

  const applyImageSize = (node, value) => {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct <= 0) return;
    node.style.width = `${pct}%`;
    node.style.height = 'auto';
    node.style.maxWidth = '100%';
    node.dataset.gfSize = String(pct);
  };

  const applyImageAlign = (node, value) => {
    const v = String(value || '').toLowerCase();
    node.dataset.gfAlign = v;

    if (v === 'left') {
      node.style.display = 'inline';
      node.style.float = 'left';
      node.style.margin = '8px 12px 8px 0';
      return;
    }

    if (v === 'right') {
      node.style.display = 'inline';
      node.style.float = 'right';
      node.style.margin = '8px 0 8px 12px';
      return;
    }

    // center / default
    node.style.float = 'none';
    node.style.display = 'block';
    node.style.margin = '12px auto';
  };

  const handleInsertImage = async () => {
    const quill = getQuill();
    if (!quill) return;
    if (!adminToken) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      try {
        input.remove();
      } catch {
        // ignore
      }
      if (!file) return;

      setUploadBusy(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_URL}/api/admin/blog/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (!data?.url) return;

        const rawUrl = String(data.url || '').trim();
        const imageUrl = rawUrl.startsWith('/') ? `${API_BASE}${rawUrl}` : rawUrl;

        const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
        quill.insertEmbed(range.index, 'image', imageUrl, 'user');
        quill.setSelection(range.index + 1, 0, 'silent');

        // Apply a sane default style so images don't come in huge.
        withSelectedImage((node) => {
          applyImageSize(node, 100);
          applyImageAlign(node, 'center');
        });
      } finally {
        setUploadBusy(false);
      }
    };

    // Must be called after we attach onchange (some browsers can behave oddly otherwise).
    input.click();
  };

  const modules = useMemo(() => {
    if (readOnly) {
      return { toolbar: false };
    }
    if (compact) {
      return { toolbar: toolbarConfig };
    }

    return {
      toolbar: {
        container: toolbarConfig,
        handlers: {
          image: handleInsertImage,
          imageSize: (value) => withSelectedImage((node) => applyImageSize(node, value)),
          imageAlign: (value) => withSelectedImage((node) => applyImageAlign(node, value)),
        },
      },
    };
  }, [compact, toolbarConfig, adminToken, uploadBusy]);

  return (
    <div
      className="admin-quill rounded-xl border border-gray-200 bg-white overflow-hidden"
      style={{ '--editor-height': `${height}px` }}
    >
      {!compact ? (
        <div id={toolbarId} className="border-b border-gray-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2">
          <select className="ql-header" defaultValue="">
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
            <option value="">Normal</option>
          </select>

          <button className="ql-bold" />
          <button className="ql-italic" />
          <button className="ql-underline" />

          <button className="ql-list" value="ordered" />
          <button className="ql-list" value="bullet" />

          <select className="ql-align" defaultValue="">
            <option value="" />
            <option value="center" />
            <option value="right" />
            <option value="justify" />
          </select>

          <button className="ql-link" />
          <button className="ql-image" disabled={uploadBusy} />
          <button className="ql-clean" />

          <span className="ml-2 text-xs font-semibold text-gray-500">Image:</span>
          <select className="ql-imageSize" defaultValue="100">
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </select>
          <select className="ql-imageAlign" defaultValue="center">
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </select>
        </div>
      ) : null}

      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={(next) => onChange?.(next)}
        placeholder={placeholder}
        modules={modules}
        readOnly={!!readOnly}
      />
    </div>
  );
}
