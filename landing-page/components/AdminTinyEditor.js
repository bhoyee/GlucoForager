'use client';

import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

export default function AdminTinyEditor({
  value,
  onChange,
  height = 360,
  placeholder = '',
  compact = false,
}) {
  const toolbar = compact
    ? [['bold', 'italic', 'underline'], [{ list: 'bullet' }, { list: 'ordered' }], ['link'], ['clean']]
    : [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'bullet' }, { list: 'ordered' }],
        [{ align: [] }],
        ['link'],
        ['clean'],
      ];

  return (
    <div
      className="admin-quill rounded-xl border border-gray-200 bg-white overflow-hidden"
      style={{ '--editor-height': `${height}px` }}
    >
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={(next) => onChange?.(next)}
        placeholder={placeholder}
        modules={{ toolbar }}
      />
    </div>
  );
}
