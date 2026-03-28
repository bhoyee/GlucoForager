'use client';

import EmptyState from '../ui/EmptyState';

export default function PayrollPage() {
  return (
    <div className="admin-card">
      <h2 className="admin-title">Payroll</h2>
      <p className="admin-subtitle">HR/Admin only. Set compensation, generate payroll runs, and send payroll emails.</p>
      <EmptyState title="Payroll setup coming next" body="Phase 2+ will add compensation setup and payroll run generation here." />
    </div>
  );
}

