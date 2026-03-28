'use client';

import EmptyState from '../ui/EmptyState';

export default function MyPayrollPage() {
  return (
    <div className="admin-card">
      <h2 className="admin-title">My Payroll</h2>
      <p className="admin-subtitle">View your payslips and monthly payroll history.</p>
      <EmptyState title="No payslips yet" body="Once HR generates a payroll run, your payslips will show up here." />
    </div>
  );
}

