'use client';

import { Editor } from '@tinymce/tinymce-react';

export default function AdminTinyEditor({
  value,
  onChange,
  height = 360,
  placeholder = '',
  compact = false,
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <Editor
        value={value}
        onEditorChange={(next) => onChange?.(next)}
        init={{
          height,
          menubar: false,
          branding: false,
          placeholder,
          statusbar: !compact,
          plugins: compact ? 'lists link' : 'lists link image table code autoresize',
          toolbar: compact
            ? 'bold italic underline | bullist numlist | link | removeformat'
            : 'undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist | link image table | code',
          content_style:
            "body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#111827;} a{color:#0D9488;}",
        }}
      />
    </div>
  );
}

