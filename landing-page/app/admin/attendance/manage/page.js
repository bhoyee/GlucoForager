'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToISO(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AttendanceManagePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [staffUsers, setStaffUsers] = useState([]);
  const [staffUserId, setStaffUserId] = useState('');
  const [entries, setEntries] = useState([]);
  const [drafts, setDrafts] = useState({});

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
      const items = Array.isArray(data.items) ? data.items : [];
      setEntries(items);
      setDrafts(() => {
        const next = {};
        items.forEach((e) => {
          next[String(e.id)] = {
            clock_in_at: toDatetimeLocalValue(e.clock_in_at),
            clock_out_at: toDatetimeLocalValue(e.clock_out_at),
            reason: '',
          };
        });
        return next;
      });
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

  const editEntry = async (entryId) => {
    if (!token) return;
    setMessage('');
    const d = drafts[String(entryId)] || {};
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/entries/${entryId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clock_in_at: datetimeLocalToISO(d.clock_in_at),
          clock_out_at: datetimeLocalToISO(d.clock_out_at),
          reason: d.reason || undefined,
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

  const approveMissedClockOut = async (entryId) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/entries/${entryId}/approve-missed-clock-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'HR approval: missed clock-out' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to approve missed clock-out.');
      loadMonth();
    } catch (e) {
      setMessage(e?.message || 'Failed to approve missed clock-out.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Manage Attendance</h2>
        <p className="admin-subtitle">HR tool to edit attendance entries and approve missed clock-outs.</p>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.work_date}</td>
                    <td>
                      <input
                        type="datetime-local"
                        value={drafts[String(e.id)]?.clock_in_at || ''}
                        onChange={(ev) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [String(e.id)]: { ...(prev[String(e.id)] || {}), clock_in_at: ev.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="datetime-local"
                        value={drafts[String(e.id)]?.clock_out_at || ''}
                        onChange={(ev) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [String(e.id)]: { ...(prev[String(e.id)] || {}), clock_out_at: ev.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>{e.day_status}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          placeholder="Reason (optional)"
                          value={drafts[String(e.id)]?.reason || ''}
                          onChange={(ev) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [String(e.id)]: { ...(prev[String(e.id)] || {}), reason: ev.target.value },
                            }))
                          }
                          style={{ minWidth: 220 }}
                        />
                        <button className="admin-button secondary" type="button" onClick={() => editEntry(e.id)}>
                          Save
                        </button>
                        {!e.clock_out_at && e.clock_in_at ? (
                          <button className="admin-button" type="button" onClick={() => approveMissedClockOut(e.id)}>
                            Approve missed clock-out
                          </button>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </div>
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

