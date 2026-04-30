'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your message...',
  minHeight = 180,
  readOnly = false,
}) {
  const modules = useMemo(
    () => ({
      toolbar: readOnly
        ? false
        : [
            ['bold', 'italic', 'underline'],
            [{ list: 'bullet' }, { list: 'ordered' }],
            ['link'],
            ['clean'],
          ],
      clipboard: {
        matchVisual: false,
      },
    }),
    [readOnly]
  );

  return (
    <div className="admin-quill admin-rich-text-editor" style={{ '--editor-height': `${minHeight}px` }}>
      <ReactQuill
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
