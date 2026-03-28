'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function ReportsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/staff/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load reports.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, year, month]);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Staff Reports</h2>
        <p className="admin-subtitle">Attendance + work log summary by month.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 100 }} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Month
            <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value || month))} min={1} max={12} style={{ width: 80 }} />
          </label>
          <button className="admin-button secondary" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : items.length === 0 ? (
          <p className="admin-subtitle">No data.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Timezone</th>
                  <th>Clocked in</th>
                  <th>Complete days</th>
                  <th>Missing clock-out</th>
                  <th>On-time in</th>
                  <th>On-time out</th>
                  <th>Late/early</th>
                  <th>Work logs</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.staff_user_id}>
                    <td>{x.email}</td>
                    <td>{x.timezone}</td>
                    <td>{x.days_clocked_in}</td>
                    <td>{x.days_complete}</td>
                    <td>{x.missing_clock_out}</td>
                    <td>{x.on_time_in}</td>
                    <td>{x.on_time_out}</td>
                    <td>{x.late_or_early}</td>
                    <td>{x.work_logs_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

