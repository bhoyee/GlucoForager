'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export default function AttendancePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth()); // 0-11
  const [entries, setEntries] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [canManage, setCanManage] = useState(false);
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
      const headers = { Authorization: `Bearer ${token}` };
      const meRes = await fetch(`${API_URL}/api/admin/me`, { headers });
      if (meRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const me = await meRes.json();
      setTimezone(me.timezone || 'UTC');
      const perms = Array.isArray(me.permissions) ? me.permissions : [];
      setCanManage(perms.includes('*') || perms.includes('attendance.manage'));

      const res = await fetch(`${API_URL}/api/admin/attendance/month?year=${year}&month=${monthIndex + 1}`, { headers });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, year, monthIndex]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      map.set(e.work_date, e);
    }
    return map;
  }, [entries]);

  const doClockIn = async () => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/clock-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Clock-in failed.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Clock-in failed.');
    }
  };

  const doClockOut = async () => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/clock-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Clock-out failed.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Clock-out failed.');
    }
  };

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const totalDays = daysInMonth(year, monthIndex);
  const firstDay = new Date(year, monthIndex, 1).getDay(); // 0 Sun

  const colorFor = (e) => {
    if (!e) return '#1f2937';
    if (e.day_status === 'clocked_in_ok') return '#b45309';
    if (e.day_status === 'clocked_in_warn') return '#b91c1c';
    if (e.day_status === 'complete_ok') return '#065f46';
    if (e.day_status === 'complete_warn') return '#92400e';
    return '#1f2937';
  };

  const bgFor = (e) => {
    if (!e) return '#0b1220';
    if (e.day_status === 'clocked_in_ok') return 'rgba(245, 158, 11, 0.18)';
    if (e.day_status === 'clocked_in_warn') return 'rgba(239, 68, 68, 0.18)';
    if (e.day_status === 'complete_ok') return 'rgba(16, 185, 129, 0.18)';
    if (e.day_status === 'complete_warn') return 'rgba(245, 158, 11, 0.12)';
    return '#0b1220';
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Clock In/Out</h2>
        <p className="admin-subtitle">
          Timezone: <code>{timezone}</code>. On-time windows: 9:00 ±30 mins, 5:00 ±30 mins.
        </p>
        {canManage && (
          <p className="admin-subtitle">
            HR tools: <a className="admin-link" href="/admin/attendance/manage">Manage staff time logs</a>
          </p>
        )}
        {message ? <div className="admin-alert info">{message}</div> : null}

        <div className="admin-actions" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={doClockIn}>
            Clock In
          </button>
          <button className="admin-button secondary" type="button" onClick={doClockOut}>
            Clock Out
          </button>
          <button className="admin-button secondary" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{monthLabel}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="admin-button secondary" type="button" onClick={() => {
              const d = new Date(year, monthIndex - 1, 1);
              setYear(d.getFullYear());
              setMonthIndex(d.getMonth());
            }}>
              Prev
            </button>
            <button className="admin-button secondary" type="button" onClick={() => {
              const d = new Date(year, monthIndex + 1, 1);
              setYear(d.getFullYear());
              setMonthIndex(d.getMonth());
            }}>
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState label={`Loading ${monthLabel}…`} />
        ) : (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} style={{ opacity: 0.7, fontSize: 12 }}>
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, idx) => (
                <div key={`pad-${idx}`} />
              ))}
              {Array.from({ length: totalDays }).map((_, idx) => {
                const day = idx + 1;
                const workDate = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
                const e = byDate.get(workDate);
                return (
                  <div
                    key={workDate}
                    style={{
                      border: `1px solid ${colorFor(e)}`,
                      background: bgFor(e),
                      borderRadius: 12,
                      padding: 10,
                      minHeight: 72,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{day}</strong>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>
                        {e?.day_status?.replaceAll('_', ' ') || ''}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, lineHeight: 1.2 }}>
                      {e?.clock_in_at ? 'In ✓' : 'In —'} · {e?.clock_out_at ? 'Out ✓' : 'Out —'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
