'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '../../ui/DataTable';

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

function isoDateInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    if (!map.year || !map.month || !map.day) return null;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function nowLocalMinutes(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

function formatTimeInZone(iso, timeZone) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
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
  const [todayItems, setTodayItems] = useState([]);
  const [todayDate, setTodayDate] = useState('');
  const [todayLoading, setTodayLoading] = useState(true);
  const [reasonModal, setReasonModal] = useState(null); // { title, text }

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedStaff = useMemo(() => staffUsers.find((u) => String(u.id) === String(staffUserId)) || null, [staffUsers, staffUserId]);
  const staffTimezone = String(selectedStaff?.timezone || 'UTC') || 'UTC';
  const staffTodayISO = useMemo(() => isoDateInTimeZone(new Date(), staffTimezone), [staffTimezone]);
  const staffNowMinutes = useMemo(() => nowLocalMinutes(staffTimezone), [staffTimezone]);

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

  const loadToday = async () => {
    if (!token) return;
    setTodayLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load today overview.');
      setTodayDate(String(data.date || ''));
      setTodayItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load today overview.');
    } finally {
      setTodayLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
    loadToday();
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
    const d = drafts[String(entryId)] || {};
    const reason = typeof d.reason === 'string' && d.reason.trim() ? d.reason.trim() : 'HR approval: missed clock-out';
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/entries/${entryId}/approve-missed-clock-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
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

  const approveClockInException = async (entryId) => {
    if (!token) return;
    setMessage('');
    const d = drafts[String(entryId)] || {};
    const reason = typeof d.reason === 'string' && d.reason.trim() ? d.reason.trim() : 'HR approval: clock-in exception';
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/entries/${entryId}/approve-clock-in-exception`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to approve missed clock-in.');
      loadMonth();
    } catch (e) {
      setMessage(e?.message || 'Failed to approve missed clock-in.');
    }
  };

  return (
    <div className="admin-page">
      {reasonModal ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={reasonModal.title || 'Reason'}
          onClick={() => setReasonModal(null)}
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{reasonModal.title || 'Reason'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={() => setReasonModal(null)}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>
                {reasonModal.text || '—'}
              </p>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-button danger" type="button" onClick={() => setReasonModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DataTable
        title="Today Overview"
        subtitle={todayDate ? `Date: ${todayDate}` : "Today's clock-in/out status for all staff."}
        rows={todayItems}
        rightActions={
          <button className="admin-button info" type="button" onClick={loadToday} disabled={todayLoading}>
            Refresh today
          </button>
        }
        emptyLabel={todayLoading ? 'Loading…' : 'No staff users.'}
        initialSortKey="email"
        initialSortDir="asc"
        searchPlaceholder="Search staff…"
        filters={[
          {
            id: 'status',
            label: 'Status',
            defaultValue: '',
            options: [
              { label: 'All statuses', value: '' },
              { label: 'Not clocked in', value: 'none' },
              { label: 'Clocked in', value: 'clocked_in' },
              { label: 'Completed', value: 'complete' },
            ],
            predicate: (row, value) => {
              const status = String(row?.day_status || '');
              if (value === 'none') return !status || status === 'none';
              if (value === 'clocked_in') return status.startsWith('clocked_in');
              if (value === 'complete') return status.startsWith('complete');
              return true;
            },
          },
        ]}
        columns={[
          {
            key: 'staff',
            label: 'Staff',
            searchValue: (r) => `${r?.full_name || ''} ${r?.email || ''}`,
            sortValue: (r) => String(r?.full_name || r?.email || ''),
            render: (row) => (row.full_name ? `${row.full_name} (${row.email})` : row.email),
          },
          {
            key: 'timezone',
            label: 'Timezone',
            sortValue: (r) => String(r?.timezone || ''),
            searchValue: (r) => String(r?.timezone || ''),
            render: (row) => row.timezone || 'UTC',
          },
          {
            key: 'clock_in_at',
            label: 'Clock in',
            sortValue: (r) => String(r?.clock_in_at || ''),
            searchValue: (r) => formatTimeInZone(r?.clock_in_at, r?.timezone || 'UTC'),
            render: (row) => formatTimeInZone(row.clock_in_at, row.timezone || 'UTC'),
          },
          {
            key: 'clock_in_reason',
            label: 'Reason (in)',
            sortable: false,
            searchValue: (r) => String(r?.clock_in_reason || ''),
            render: (row) => {
              const txt = String(row.clock_in_reason || '').trim();
              if (!txt) return <span style={{ opacity: 0.7 }}>No</span>;
              return (
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setReasonModal({ title: 'Clock-in reason', text: txt })}
                  style={{ padding: '6px 10px', borderRadius: 10 }}
                >
                  YES
                </button>
              );
            },
          },
          {
            key: 'clock_out_at',
            label: 'Clock out',
            sortValue: (r) => String(r?.clock_out_at || ''),
            searchValue: (r) => formatTimeInZone(r?.clock_out_at, r?.timezone || 'UTC'),
            render: (row) => formatTimeInZone(row.clock_out_at, row.timezone || 'UTC'),
          },
          {
            key: 'clock_out_reason',
            label: 'Reason (out)',
            sortable: false,
            searchValue: (r) => String(r?.clock_out_reason || ''),
            render: (row) => {
              const txt = String(row.clock_out_reason || '').trim();
              if (!txt) return <span style={{ opacity: 0.7 }}>No</span>;
              return (
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setReasonModal({ title: 'Clock-out reason', text: txt })}
                  style={{ padding: '6px 10px', borderRadius: 10 }}
                >
                  YES
                </button>
              );
            },
          },
          {
            key: 'day_status',
            label: 'Status',
            sortValue: (r) => String(r?.day_status || ''),
            searchValue: (r) => String(r?.day_status || ''),
            render: (row) => {
              const status = String(row.day_status || '');
              const label = status.startsWith('clocked_in') ? 'Clocked in' : status.startsWith('complete') ? 'Completed' : 'Not clocked in';
              const badge = label === 'Clocked in' ? 'success' : label === 'Completed' ? 'danger' : 'secondary';
              return <span className={`admin-badge ${badge}`}>{label}</span>;
            },
          },
        ]}
      />

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
          <button className="admin-button info" type="button" onClick={loadMonth}>
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
                  <th>Reason (in)</th>
                  <th>Clock out</th>
                  <th>Reason (out)</th>
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
                      {String(e.clock_in_reason || '').trim() ? (
                        <button
                          className="admin-button secondary"
                          type="button"
                          onClick={() => setReasonModal({ title: 'Clock-in reason', text: String(e.clock_in_reason || '').trim() })}
                          style={{ padding: '6px 10px', borderRadius: 10 }}
                        >
                          YES
                        </button>
                      ) : (
                        <span style={{ opacity: 0.7 }}>No</span>
                      )}
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
                    <td>
                      {String(e.clock_out_reason || '').trim() ? (
                        <button
                          className="admin-button secondary"
                          type="button"
                          onClick={() => setReasonModal({ title: 'Clock-out reason', text: String(e.clock_out_reason || '').trim() })}
                          style={{ padding: '6px 10px', borderRadius: 10 }}
                        >
                          YES
                        </button>
                      ) : (
                        <span style={{ opacity: 0.7 }}>No</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const status = String(e.day_status || '');
                        const label = status.startsWith('clocked_in') ? 'Clocked in' : status.startsWith('complete') ? 'Completed' : 'Not clocked in';
                        const badge = label === 'Clocked in' ? 'success' : label === 'Completed' ? 'danger' : 'secondary';
                        return <span className={`admin-badge ${badge}`}>{label}</span>;
                      })()}
                    </td>
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
                        {(() => {
                          const workDate = String(e.work_date || '');
                          const isToday = Boolean(staffTodayISO && workDate === staffTodayISO);
                          const isPast = Boolean(staffTodayISO && workDate < staffTodayISO);
                          const afterClockOutWindow = staffNowMinutes != null && staffNowMinutes > 17 * 60 + 30;

                          const canApproveOut = Boolean(e.clock_in_at && !e.clock_out_at && (isPast || (isToday && afterClockOutWindow)));
                          const canApproveIn = Boolean(e.clock_in_at && e.clock_in_ok === false && !e.approved_at);

                          if (canApproveIn) {
                            return (
                              <button className="admin-button danger" type="button" onClick={() => approveClockInException(e.id)}>
                                Approve missed clock-in
                              </button>
                            );
                          }

                          if (canApproveOut) {
                            return (
                              <button className="admin-button danger" type="button" onClick={() => approveMissedClockOut(e.id)}>
                                Approve missed clock-out
                              </button>
                            );
                          }

                          return <span style={{ opacity: 0.6 }}>—</span>;
                        })()}
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
