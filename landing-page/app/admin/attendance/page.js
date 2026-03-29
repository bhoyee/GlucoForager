'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
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
  const [messageTone, setMessageTone] = useState('info'); // info | success | warning | danger
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null); // { text, tone }
  const toastTimerRef = useRef(null);
  const successBannerTimerRef = useRef(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonMode, setReasonMode] = useState(null); // 'in' | 'out'
  const [reasonText, setReasonText] = useState('');

  const showToast = (text, tone = 'info', ms = 2600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };

  const showSuccessBanner = (text) => {
    if (successBannerTimerRef.current) clearTimeout(successBannerTimerRef.current);
    setMessage(text);
    setMessageTone('success');
    successBannerTimerRef.current = setTimeout(() => {
      setMessage('');
      setMessageTone('info');
    }, 3500);
  };

  const openReason = (mode) => {
    setReasonMode(mode);
    setReasonText('');
    setReasonOpen(true);
  };

  const closeReason = () => {
    setReasonOpen(false);
    setReasonMode(null);
    setReasonText('');
  };

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
      setMessageTone('danger');
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

  const submitClockIn = async (reason, { allowReasonPrompt } = { allowReasonPrompt: false }) => {
    if (!token) return;
    setMessage('');
    setMessageTone('info');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/clock-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (res.status === 422 && allowReasonPrompt) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        if (detail.toLowerCase().includes('reason required')) {
          openReason('in');
          return;
        }
      }
      if (!res.ok) throw new Error(data.detail || 'Clock-in failed.');
      showToast('Clock in confirmed.', 'success');
      showSuccessBanner('Clock in confirmed.');
      load();
    } catch (e) {
      setMessageTone('danger');
      setMessage(e?.message || 'Clock-in failed.');
      showToast(e?.message || 'Clock-in failed.', 'danger', 3400);
    }
  };

  const submitClockOut = async (reason, { allowReasonPrompt } = { allowReasonPrompt: false }) => {
    if (!token) return;
    setMessage('');
    setMessageTone('info');
    try {
      const res = await fetch(`${API_URL}/api/admin/attendance/clock-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (res.status === 422 && allowReasonPrompt) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        if (detail.toLowerCase().includes('reason required')) {
          openReason('out');
          return;
        }
      }
      if (!res.ok) throw new Error(data.detail || 'Clock-out failed.');
      showToast('Clock out confirmed.', 'success');
      showSuccessBanner('Clock out confirmed.');
      load();
    } catch (e) {
      setMessageTone('danger');
      setMessage(e?.message || 'Clock-out failed.');
      showToast(e?.message || 'Clock-out failed.', 'danger', 3400);
    }
  };

  const doClockIn = async () => {
    if (!token) return;
    submitClockIn(null, { allowReasonPrompt: true });
  };

  const doClockOut = async () => {
    if (!token) return;
    submitClockOut(null, { allowReasonPrompt: true });
  };

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const totalDays = daysInMonth(year, monthIndex);
  const firstDay = new Date(year, monthIndex, 1).getDay(); // 0 Sun

  const todayISO = useMemo(() => isoDateInTimeZone(new Date(), timezone || 'UTC'), [timezone]);

  const statusBadge = (status) => {
    if (!status) return null;
    if (status === 'complete_ok') return { label: 'Complete', className: '' };
    if (status === 'complete_warn') return { label: 'Complete (warn)', className: 'warning' };
    if (status === 'clocked_in_ok') return { label: 'Clocked in', className: 'warning' };
    if (status === 'clocked_in_warn') return { label: 'Clocked in (warn)', className: 'danger' };
    return { label: status.replaceAll('_', ' '), className: 'secondary' };
  };

  return (
    <div className="admin-page">
      {toast ? (
        <div className="admin-toast-stack" role="status" aria-live="polite">
          <div className={`admin-toast ${toast.tone || 'info'}`}>{toast.text}</div>
        </div>
      ) : null}

      {reasonOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Reason required" onClick={closeReason}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Reason required</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeReason}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                {reasonMode === 'in'
                  ? 'You are clocking in outside the on-time window (09:00 ± 30 mins). Please add a reason.'
                  : 'You are clocking out outside the allowed window (17:00–17:30). Please add a reason.'}
              </p>
              <div className="admin-field">
                <label>Reason</label>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  maxLength={240}
                  placeholder="Write a short reason..."
                />
                <p className="admin-help">Max 240 characters.</p>
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button secondary" type="button" onClick={closeReason}>
                Cancel
              </button>
              <button
                className="admin-button"
                type="button"
                onClick={() => {
                  const r = reasonText.trim();
                  if (!r) {
                    showToast('Please enter a reason.', 'warning', 2200);
                    return;
                  }
                  const mode = reasonMode;
                  closeReason();
                  if (mode === 'in') submitClockIn(r, { allowReasonPrompt: false });
                  else submitClockOut(r, { allowReasonPrompt: false });
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="admin-card">
        <h2 className="admin-title">Clock In/Out</h2>
        <p className="admin-subtitle">
          Timezone: <code>{timezone}</code>. Windows: clock-in 09:00 ±30 mins, clock-out 17:00–17:30.
        </p>
        {canManage && (
          <p className="admin-subtitle">
            HR tools: <a className="admin-link" href="/admin/attendance/manage">Manage staff time logs</a>
          </p>
        )}
        {message ? (
          <div className={`admin-alert admin-alert--dismissible ${messageTone || 'info'}`} style={{ marginTop: 12, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>{message}</div>
            <button
              type="button"
              className="admin-alert-close"
              aria-label="Dismiss message"
              onClick={() => {
                setMessage('');
                setMessageTone('info');
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}

        <div className="admin-actions" style={{ gap: 12, flexWrap: 'wrap', marginTop: message ? 0 : 12 }}>
          <button className="admin-button" type="button" onClick={doClockIn}>
            Clock In
          </button>
          <button className="admin-button danger" type="button" onClick={doClockOut}>
            Clock Out
          </button>
          <button className="admin-button info" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{monthLabel}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="admin-button info"
              type="button"
              onClick={() => {
                const d = new Date();
                setYear(d.getFullYear());
                setMonthIndex(d.getMonth());
              }}
            >
              Today
            </button>
            <button className="admin-button secondary" type="button" onClick={() => {
              const d = new Date(year, monthIndex - 1, 1);
              setYear(d.getFullYear());
              setMonthIndex(d.getMonth());
            }}>
              Prev
            </button>
            <button className="admin-button" type="button" onClick={() => {
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
          <div className="attendance-calendar">
            <div className="attendance-calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="attendance-weekday">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDay }).map((_, idx) => (
                <div key={`pad-${idx}`} className="attendance-day attendance-day--empty" aria-hidden="true" />
              ))}
              {Array.from({ length: totalDays }).map((_, idx) => {
                const day = idx + 1;
                const workDate = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
                const e = byDate.get(workDate);
                const status = e?.day_status || '';
                const badge = statusBadge(status);
                const isToday = Boolean(todayISO && workDate === todayISO);
                const className = [
                  'attendance-day',
                  !e ? 'attendance-day--empty' : '',
                  e ? 'attendance-day--has-entry' : '',
                  status ? `attendance-day--status-${status}` : '',
                  isToday ? 'attendance-day--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={workDate} className={className}>
                    <div className="attendance-day-top">
                      <div className="attendance-day-number">
                        <span>{day}</span>
                      </div>
                      <span className="attendance-status-dot" title={badge?.label || ''} aria-label={badge?.label || ''} />
                    </div>

                    <div className="attendance-times">
                      <div className="attendance-time-row">
                        <span>IN</span>
                        <div>{formatTimeInZone(e?.clock_in_at, timezone || 'UTC')}</div>
                      </div>
                      <div className="attendance-time-row">
                        <span>OUT</span>
                        <div>{formatTimeInZone(e?.clock_out_at, timezone || 'UTC')}</div>
                      </div>
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
