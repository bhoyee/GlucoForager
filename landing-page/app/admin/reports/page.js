'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [monthDetail, setMonthDetail] = useState(null);
  const [weekStart, setWeekStart] = useState(mondayOfWeek(now));
  const [weekDetail, setWeekDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      if (!selectedStaffId && rows[0]?.staff_user_id) setSelectedStaffId(String(rows[0].staff_user_id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/staff/month.csv?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to download CSV.');
      }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff_report_${year}-${String(month).padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e?.message || 'Failed to download CSV.');
    }
  };

  const loadMonthDetail = async (staffId) => {
    if (!token || !staffId) return;
    setDetailLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/staff/${staffId}/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff month detail.');
      setMonthDetail(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff month detail.');
      setMonthDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadWeekDetail = async (staffId) => {
    if (!token || !staffId) return;
    setDetailLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/staff/${staffId}/week?start=${encodeURIComponent(weekStart)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff week detail.');
      setWeekDetail(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff week detail.');
      setWeekDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, year, month]);

  useEffect(() => {
    if (selectedStaffId) loadMonthDetail(selectedStaffId);
  }, [selectedStaffId, year, month]);

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
          <button className="admin-button info" type="button" onClick={load}>
            Refresh
          </button>
          <button className="admin-button" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <LoadingState label="Loading reports…" />
        ) : items.length === 0 ? (
          <EmptyState title="No report data" body="Once staff clock in/out and write logs, monthly summaries will appear here." />
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.staff_user_id} style={String(x.staff_user_id) === String(selectedStaffId) ? { background: 'rgba(255,255,255,0.04)' } : undefined}>
                    <td>{x.email}</td>
                    <td>{x.timezone}</td>
                    <td>{x.days_clocked_in}</td>
                    <td>{x.days_complete}</td>
                    <td>{x.missing_clock_out}</td>
                    <td>{x.on_time_in}</td>
                    <td>{x.on_time_out}</td>
                    <td>{x.late_or_early}</td>
                    <td>{x.work_logs_count}</td>
                    <td>
                      <button
                        className="admin-button secondary"
                        type="button"
                        onClick={() => {
                          setSelectedStaffId(String(x.staff_user_id));
                          setWeekDetail(null);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Per-staff details</h3>
        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Staff
            <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} style={{ minWidth: 260 }}>
              {items.map((x) => (
                <option key={x.staff_user_id} value={x.staff_user_id}>
                  {x.email}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Week start
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
          <button className="admin-button secondary" type="button" onClick={() => loadMonthDetail(selectedStaffId)} disabled={!selectedStaffId}>
            Reload month
          </button>
          <button className="admin-button" type="button" onClick={() => loadWeekDetail(selectedStaffId)} disabled={!selectedStaffId}>
            Load week
          </button>
        </div>

        {detailLoading ? (
          <p className="admin-subtitle" style={{ marginTop: 12 }}>
            Loading details...
          </p>
        ) : monthDetail ? (
          <div style={{ marginTop: 12 }}>
            <p className="admin-subtitle">
              <strong>{monthDetail.email}</strong> ({monthDetail.timezone}) — {monthDetail.month}
            </p>
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock in</th>
                    <th>Clock out</th>
                    <th>Missing clock-out</th>
                    <th>Work logs</th>
                    <th>Edited</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(monthDetail.days) ? monthDetail.days : []).map((d) => (
                    <tr key={d.work_date}>
                      <td>{d.work_date}</td>
                      <td>{d.clock_in_at || '—'}</td>
                      <td>{d.clock_out_at || '—'}</td>
                      <td>{d.missing_clock_out ? 'Yes' : 'No'}</td>
                      <td>{d.work_logs_count}</td>
                      <td>{d.edited_at ? 'Yes' : 'No'}</td>
                      <td>{d.approved_at ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="admin-subtitle" style={{ marginTop: 12 }}>
            Select a staff user to view details.
          </p>
        )}

        {weekDetail ? (
          <div style={{ marginTop: 16 }}>
            <p className="admin-subtitle">
              Week: {weekDetail.week_start} → {weekDetail.week_end}
            </p>
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock in</th>
                    <th>Clock out</th>
                    <th>Missing clock-out</th>
                    <th>Work logs</th>
                    <th>Edited</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(weekDetail.days) ? weekDetail.days : []).map((d) => (
                    <tr key={d.work_date}>
                      <td>{d.work_date}</td>
                      <td>{d.clock_in_at || '—'}</td>
                      <td>{d.clock_out_at || '—'}</td>
                      <td>{d.missing_clock_out ? 'Yes' : 'No'}</td>
                      <td>{d.work_logs_count}</td>
                      <td>{d.edited_at ? 'Yes' : 'No'}</td>
                      <td>{d.approved_at ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
