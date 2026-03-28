'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export default function WorkLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isManager = permissions.includes('*') || permissions.includes('work_logs.manage');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthLogs, setMonthLogs] = useState([]);

  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState([{ text: '', done: false }]);
  const [links, setLinks] = useState(['']);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [staffUsers, setStaffUsers] = useState([]);
  const [staffUserId, setStaffUserId] = useState('');
  const [weekStart, setWeekStart] = useState(mondayOfWeek(now));
  const [weekData, setWeekData] = useState(null);
  const [weekLoading, setWeekLoading] = useState(false);

  const [selectedLogId, setSelectedLogId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');

  const loadSession = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } catch {
      setSession(null);
    }
  };

  const loadMonth = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load work logs.');
      setMonthLogs(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load work logs.');
    } finally {
      setLoading(false);
    }
  };

  const loadStaff = async () => {
    if (!token || !isManager) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff users.');
      const items = Array.isArray(data.items) ? data.items : [];
      setStaffUsers(items);
      if (!staffUserId && items[0]?.id) setStaffUserId(String(items[0].id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff users.');
    }
  };

  const loadWeek = async () => {
    if (!token || !isManager || !staffUserId || !weekStart) return;
    setWeekLoading(true);
    setMessage('');
    try {
      const res = await fetch(
        `${API_URL}/api/admin/work-logs/week?start=${encodeURIComponent(weekStart)}&staff_user_id=${encodeURIComponent(staffUserId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load weekly work logs.');
      setWeekData(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load weekly work logs.');
      setWeekData(null);
    } finally {
      setWeekLoading(false);
    }
  };

  const loadLogDetail = async (logId) => {
    if (!token || !logId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/${logId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load work log.');
      setSelectedLogId(logId);
      setSelectedLog(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load work log.');
      setSelectedLogId(null);
      setSelectedLog(null);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    loadMonth();
  }, [token, year, month]);

  useEffect(() => {
    loadStaff();
  }, [token, isManager]);

  useEffect(() => {
    loadWeek();
  }, [token, isManager, staffUserId, weekStart]);

  useEffect(() => {
    const logId = searchParams?.get('log');
    if (!logId) return;
    const n = Number(logId);
    if (Number.isNaN(n) || n <= 0) return;
    loadLogDetail(n);
  }, [searchParams, token]);

  const saveToday = async () => {
    if (!token) return;
    setMessage('');
    try {
      const cleanTasks = tasks
        .filter((t) => t.text && t.text.trim())
        .map((t) => ({ text: t.text.trim(), done: Boolean(t.done) }));
      const cleanLinks = links.filter((l) => l && l.trim()).map((l) => l.trim());
      const res = await fetch(`${API_URL}/api/admin/work-logs/upsert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: todayISO(),
          summary,
          tasks: cleanTasks,
          links: cleanLinks,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to save work log.');
      setMessage('Saved.');
      loadMonth();
    } catch (e) {
      setMessage(e?.message || 'Failed to save work log.');
    }
  };

  const sendReminder = async (workDate) => {
    if (!token || !staffUserId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(staffUserId),
          work_date: workDate,
          message: 'Reminder: please submit your work log',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save reminder.');
      loadWeek();
    } catch (e) {
      setMessage(e?.message || 'Failed to save reminder.');
    }
  };

  const addFeedback = async () => {
    if (!token || !isManager || !selectedLogId) return;
    const text = String(commentDraft || '').trim();
    if (!text) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/${selectedLogId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to add comment.');
      setCommentDraft('');
      loadLogDetail(selectedLogId);
      loadWeek();
    } catch (e) {
      setMessage(e?.message || 'Failed to add comment.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Daily Work Log</h2>
        <p className="admin-subtitle">Universal for all roles (marketer, designer, developer, HR, support).</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-field">
          <label>Summary (today)</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What did you work on today?" />
        </div>

        <div className="admin-field">
          <label>Tasks</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((t, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => {
                    setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, done: e.target.checked } : x)));
                  }}
                />
                <input
                  value={t.text}
                  onChange={(e) => setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))}
                  placeholder="Task description"
                />
                <button className="admin-button secondary" type="button" onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="admin-button secondary" type="button" onClick={() => setTasks((prev) => [...prev, { text: '', done: false }])}>
              Add task
            </button>
          </div>
        </div>

        <div className="admin-field">
          <label>Links</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((l, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <input value={l} onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))} placeholder="https://..." />
                <button className="admin-button secondary" type="button" onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="admin-button secondary" type="button" onClick={() => setLinks((prev) => [...prev, ''])}>
              Add link
            </button>
          </div>
        </div>

        <div className="admin-actions">
          <button className="admin-button" type="button" onClick={saveToday}>
            Save today
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>My Month Logs</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 90 }} />
            <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value || month))} min={1} max={12} style={{ width: 70 }} />
            <button className="admin-button secondary" type="button" onClick={loadMonth}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading month logs…" />
        ) : monthLogs.length === 0 ? (
          <EmptyState title="No logs yet" body="Your saved daily logs will appear here." />
        ) : (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Summary</th>
                  <th>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {monthLogs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.work_date}</td>
                    <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{r.payload?.summary || ''}</td>
                    <td>{Array.isArray(r.payload?.tasks) ? r.payload.tasks.length : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isManager ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>HR/Admin: Weekly Review</h3>
          <p className="admin-subtitle">Filter by staff, review weekly logs, add feedback, and record reminders for missing logs.</p>

          <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Staff
              <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={{ minWidth: 280 }}>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.timezone})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Week start
              <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </label>
            <button className="admin-button secondary" type="button" onClick={loadWeek} disabled={!staffUserId}>
              Refresh
            </button>
          </div>

          {weekLoading ? (
            <div style={{ marginTop: 12 }}>
              <LoadingState label="Loading week summary…" />
            </div>
          ) : !weekData ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState title="No staff selected" body="Pick a staff member to view weekly summaries and reminders." />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="admin-card admin-card--subtle admin-card--compact">
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  <strong>{weekData.email}</strong> — {weekData.week_start} → {weekData.week_end} | Logs: {weekData.summary?.logs_written} | Missing:{' '}
                  {weekData.summary?.missing_logs} | Tasks done: {weekData.summary?.tasks_done}/{weekData.summary?.tasks_total} | Comments:{' '}
                  {weekData.summary?.comments_total} | Reminders: {weekData.summary?.reminders_total}
                </p>
              </div>

              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Attendance</th>
                      <th>Summary</th>
                      <th>Comments</th>
                      <th>Reminder</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(weekData.days) ? weekData.days : []).map((d) => (
                      <tr key={d.work_date} style={d.missing_log ? { background: 'rgba(255, 99, 71, 0.10)' } : undefined}>
                        <td>{d.work_date}</td>
                        <td>{d.attendance?.clock_in_at ? 'Clocked in' : '—'}</td>
                        <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{d.work_log?.payload?.summary || (d.missing_log ? 'Missing log' : '—')}</td>
                        <td>{d.comments_count || 0}</td>
                        <td>{d.reminder ? 'Sent' : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {d.work_log?.id ? (
                              <button className="admin-button secondary" type="button" onClick={() => loadLogDetail(d.work_log.id)}>
                                View
                              </button>
                            ) : null}
                            {d.missing_log && !d.reminder ? (
                              <button className="admin-button" type="button" onClick={() => sendReminder(d.work_date)}>
                                Record reminder
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedLog ? (
                <div className="admin-card" style={{ marginTop: 16, padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Feedback</h4>
                  <p className="admin-subtitle" style={{ marginTop: 6 }}>
                    Work log #{selectedLog.id} — {selectedLog.work_date}
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selectedLog.payload?.summary || ''}</p>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <h5 style={{ margin: 0 }}>Comments</h5>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Array.isArray(selectedLog.comments) ? selectedLog.comments : []).length === 0 ? (
                        <p className="admin-subtitle" style={{ margin: 0 }}>
                          No feedback yet.
                        </p>
                      ) : (
                        (Array.isArray(selectedLog.comments) ? selectedLog.comments : []).map((c) => (
                          <div key={c.id} className="admin-card" style={{ padding: 10 }}>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.comment}</p>
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                              {c.created_at || ''}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="admin-field">
                      <label>Add feedback</label>
                      <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} rows={3} placeholder="Write feedback for this day..." />
                    </div>
                    <div className="admin-actions">
                      <button className="admin-button" type="button" onClick={addFeedback} disabled={!String(commentDraft || '').trim()}>
                        Add comment
                      </button>
                      <button
                        className="admin-button secondary"
                        type="button"
                        onClick={() => {
                          setSelectedLogId(null);
                          setSelectedLog(null);
                          setCommentDraft('');
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
