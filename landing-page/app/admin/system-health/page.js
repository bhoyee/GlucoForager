import { Suspense } from 'react';
import SystemHealthClient from './system-health-client';

export default function AdminSystemHealthPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-card admin-health-page">
          <p>Loading health checks...</p>
        </div>
      }
    >
      <SystemHealthClient />
    </Suspense>
  );
}

