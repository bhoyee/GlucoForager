'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AttendanceManagePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [staffUsers, setStaffUsers] = useState([]);
  const [staffUserId, setStaffUserId] = useState('');
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStaff = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff users.');
      const items = Array.isArray(data.items) ? data.items : [];
      setStaffUsers(items);
      if (!staffUserId && items[0]?.id) setStaffUserId(String(items[0].id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff users.');
    }
  };

  const loadMonth = async () => {
    if (!token || !staffUserId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(
        `${API_URL}/api/admin/attendance/month?year=${year}&month=${month}&staff_user_id=${encodeURIComponent(staffUserId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load attendance.');
      setEntries(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, [token]);

  useEffect(() => {
    loadMonth();
  }, [token, staffUserId, year, month]);

  const setClockOutNow = async (entryId) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/entries/${entryId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clock_out_at: new Date().toISOString(),
          reason: 'HR fix: missing clock-out',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to edit entry.');
      loadMonth();
    } catch (e) {
      setMessage(e?.message || 'Failed to edit entry.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Manage Attendance</h2>
        <p className="admin-subtitle">HR tool to fix missed clock-outs and edit entries.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Staff
            <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={{ minWidth: 260 }}>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} ({u.timezone})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 100 }} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Month
            <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value || month))} min={1} max={12} style={{ width: 80 }} />
          </label>
          <button className="admin-button secondary" type="button" onClick={loadMonth}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="admin-subtitle">No entries.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.work_date}</td>
                    <td>{e.clock_in_at || '—'}</td>
                    <td>{e.clock_out_at || '—'}</td>
                    <td>{e.day_status}</td>
                    <td>
                      {!e.clock_out_at && e.clock_in_at ? (
                        <button className="admin-button secondary" type="button" onClick={() => setClockOutNow(e.id)}>
                          Set clock-out now
                        </button>
                      ) : (
                        <span style={{ opacity: 0.6 }}>—</span>
                      )}
                    </td>
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

