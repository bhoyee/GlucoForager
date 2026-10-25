'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const STATUS_BADGE = {
  planned: ['Planned', 'info'],
  reserve: ['Reserve', 'secondary'],
  drafting: ['Writing…', 'warning'],
  drafted: ['Draft ready', 'success'],
  skipped: ['Skipped', 'secondary'],
  failed: ['Failed', 'danger'],
};

const fmtDay = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

function Signals({ s }) {
  const bits = [];
  if (s.countries?.length) bits.push(s.countries.map((c) => (c === 'gb' ? 'UK' : c.toUpperCase())).join(' + '));
  if (s.engines?.length) bits.push(s.engines.map((e) => e[0].toUpperCase() + e.slice(1)).join(' + '));
  if (s.bing_volume) bits.push(`~${Number(s.bing_volume).toLocaleString()} Bing searches / 4 wks`);
  if (s.trend && s.trend >= 1.1) bits.push(`rising ${Math.round((s.trend - 1) * 100)}%`);
  if (s.recipe_matches) bits.push(`${s.recipe_matches} matching recipes`);
  if (s.seasonal) bits.push('seasonal');
  return <div style={{ color: '#6b7280', fontSize: 13 }}>{bits.join(' · ')}</div>;
}

export default function BlogAutopilotPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  const call = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${API_URL}/api/admin/blog/autopilot${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        throw new Error('Signed out');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Request failed.');
      return body;
    },
    [router, token],
  );

  const load = useCallback(async () => {
    try {
      setData(await call(''));
    } catch (e) {
      setMessage(e.message);
    }
  }, [call]);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    load();
  }, [token, router, load]);

  // While research or a draft is running, refresh every 20 seconds.
  const busy = data?.planning || data?.topics?.some((t) => t.status === 'drafting');
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [busy, load]);

  const act = async (id, path, body, okMessage) => {
    setBusyId(id);
    setMessage('');
    try {
      const res = await call(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      setMessage(res?.note || okMessage);
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const weeks = useMemo(() => {
    const groups = {};
    for (const t of data?.topics || []) {
      if (!groups[t.week_of]) groups[t.week_of] = [];
      groups[t.week_of].push(t);
    }
    return Object.entries(groups);
  }, [data]);

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Blog Autopilot</h2>
        <p className="admin-subtitle">
          Every Sunday evening it researches what people in the US and UK are searching (Google and Bing autocomplete, Bing
          search volumes) and plans three topics. Drafts are written at 6am on Mon, Wed and Fri and emailed to you. Nothing is
          published until you publish it.
        </p>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      {data ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '12px 0 18px' }}>
          <span className={`admin-badge ${data.enabled ? 'success' : 'warning'}`}>{data.enabled ? 'Schedule on' : 'Schedule off'}</span>
          <span className={`admin-badge ${data.bing_configured ? 'success' : 'warning'}`}>
            {data.bing_configured ? 'Bing volumes connected' : 'Bing key missing'}
          </span>
          <span className={`admin-badge ${data.ai_configured ? 'success' : 'warning'}`}>{data.ai_configured ? 'AI ready' : 'AI key missing'}</span>
          {data.planning ? <span className="admin-badge warning">Researching… (about 10 min)</span> : null}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="admin-button info"
            onClick={() => act('plan', '/plan', { force: false }, 'Research started.')}
            disabled={!!busyId || data.planning}
          >
            Plan this week now
          </button>
          <button
            type="button"
            className="admin-button secondary"
            onClick={() => act('replan', '/plan', { force: true }, 'Re-planning started.')}
            disabled={!!busyId || data.planning}
          >
            Re-plan unwritten topics
          </button>
        </div>
      ) : (
        <p>Loading…</p>
      )}

      {data && weeks.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No topics yet. The first plan arrives on Sunday evening, or click “Plan this week now”.</p>
      ) : null}

      {weeks.map(([week, topics]) => (
        <section key={week} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>Week of {fmtDay(week)}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Day</th>
                  <th>Topic</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 210 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => {
                  const [label, tone] = STATUS_BADGE[t.status] || [t.status, 'secondary'];
                  const open = ['planned', 'reserve', 'failed'].includes(t.status);
                  return (
                    <tr key={t.id} style={t.status === 'skipped' ? { opacity: 0.55 } : undefined}>
                      <td>{t.planned_for ? fmtDay(t.planned_for) : '—'}</td>
                      <td>
                        <strong>{t.post?.title || t.title_idea || t.keyword}</strong>
                        <div style={{ color: '#0f766e', fontSize: 13 }}>Keyword: {t.keyword}</div>
                        <Signals s={t.signals || {}} />
                        {t.angle ? <div style={{ fontSize: 13, marginTop: 4 }}>{t.angle}</div> : null}
                        {t.signals?.checks?.length ? (
                          <div style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>Check: {t.signals.checks.join(' · ')}</div>
                        ) : null}
                        {t.error ? <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 4 }}>{t.error}</div> : null}
                      </td>
                      <td>
                        <span className={`admin-badge ${tone}`}>{label}</span>
                        {t.post ? <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Post: {t.post.status}</div> : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {t.post ? (
                            <Link className="admin-button info" href={`/admin/blog/${t.post.id}`}>
                              Review draft
                            </Link>
                          ) : null}
                          {open ? (
                            <button
                              type="button"
                              className="admin-button"
                              disabled={!!busyId}
                              onClick={() => act(t.id, `/topics/${t.id}/draft`, null, 'Drafting started.')}
                            >
                              {t.status === 'failed' ? 'Retry' : 'Draft now'}
                            </button>
                          ) : null}
                          {t.status === 'planned' ? (
                            <button
                              type="button"
                              className="admin-button secondary"
                              disabled={!!busyId}
                              onClick={() => act(t.id, `/topics/${t.id}/swap`, null, 'Swapped for the best reserve.')}
                            >
                              Swap
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
