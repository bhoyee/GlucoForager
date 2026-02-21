import { Suspense } from 'react';
import CommentsClient from './CommentsClient';

export const dynamic = 'force-dynamic';

export default function AdminBlogCommentsPage() {
  return (
    <Suspense fallback={<div className="admin-card"><p className="admin-subtitle">Loading comments...</p></div>}>
      <CommentsClient />
    </Suspense>
  );
}

