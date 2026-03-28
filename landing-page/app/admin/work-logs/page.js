'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function WorkLogsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthLogs, setMonthLogs] = useState([]);

  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState([{ text: '', done: false }]);
  const [links, setLinks] = useState(['']);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

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
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMonthLogs(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('Failed to load work logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonth();
  }, [token, year, month]);

  const saveToday = async () => {
    if (!token) return;
    setMessage('');
    try {
      const cleanTasks = tasks.filter((t) => t.text && t.text.trim()).map((t) => ({ text: t.text.trim(), done: Boolean(t.done) }));
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

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Daily Work Log</h2>
        <p className="admin-subtitle">This is universal for all roles (marketer, designer, developer, HR, support).</p>
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
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}
                >
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
          <h3 style={{ margin: 0 }}>Month Logs</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 90 }} />
            <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value || month))} min={1} max={12} style={{ width: 70 }} />
            <button className="admin-button secondary" type="button" onClick={loadMonth}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : monthLogs.length === 0 ? (
          <p className="admin-subtitle">No logs for this month yet.</p>
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
    </div>
  );
}

