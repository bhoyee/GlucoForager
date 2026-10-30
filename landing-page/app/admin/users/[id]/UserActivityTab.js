'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 25;
const BAR_COLOR = '#0d9488';

const formatDateTime = (value) => {
  if (!value) return '--';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '--'
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const timeAgo = (value) => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

// Metadata worth showing to an admin, in plain words; anything else stays under "Details".
const META_LABELS = {
  request_type: 'AI type',
  model_used: 'Model',
  tier: 'Plan',
  recipe_name: 'Recipe',
  recipe_id: 'Recipe ID',
  meal_type: 'Meal',
  value: 'Value',
  unit: 'Unit',
  barcode: 'Barcode',
  product_name: 'Product',
  platform: 'Platform',
  count: 'Count',
  task: 'Task',
};

function MetaSummary({ metadata }) {
  const entries = Object.entries(metadata || {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
  if (!entries.length) return null;
  const known = entries.filter(([k]) => META_LABELS[k]).slice(0, 3);
  return (
    <span style={{ color: '#64748b', fontSize: 12 }}>
      {known.map(([k, v]) => `${META_LABELS[k]}: ${String(v).slice(0, 40)}`).join(' · ')}
    </span>
  );
}

export default function UserActivityTab({ userId, token }) {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [feature, setFeature] = useState('');
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const get = useCallback(
    async (path) => {
      const res = await fetch(`${API_URL}/api/admin/user-activity/user/${userId}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(res.status === 403 ? 'You need the users.read permission to see activity.' : 'Could not load activity.');
      return res.json();
    },
    [token, userId],
  );

  useEffect(() => {
    if (!userId || !token) return;
    get(`/summary?days=${days}`).then(setSummary).catch((e) => setError(e.message));
  }, [days, get, token, userId]);

  useEffect(() => {
    if (!userId || !token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (feature) params.set('feature', feature);
    if (includeTechnical) params.set('include_technical', 'true');
    get(`?${params}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [feature, get, includeTechnical, page, token, userId]);

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const maxUses = Math.max(1, ...(summary?.features || []).map((f) => f.uses));

  return (
    <div className="admin-card" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ marginRight: 'auto' }}>
          <h3 className="admin-title admin-title--sm">Activity</h3>
          <p className="admin-subtitle admin-subtitle--sm">
            What this user does in the app: features used and every action, newest first. Activity is kept for 60 days.
          </p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Summary period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
        </select>
      </div>

      {error ? <div className="admin-message">{error}</div> : null}

      {summary ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '14px 0' }}>
            {[
              ['Last active', summary.last_activity_at ? timeAgo(summary.last_activity_at) : 'No activity', formatDateTime(summary.last_activity_at)],
              ['Active days', `${summary.active_days} of ${summary.days}`, 'Days with at least one action'],
              ['Actions', String(summary.actions), `In the last ${summary.days} days`],
              ['Most used', summary.top_feature || '--', 'Feature used most'],
            ].map(([label, value, hint]) => (
              <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }} title={hint}>
                <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '6px 0 8px' }}>Features used (last {summary.days} days)</h4>
          {summary.features.length ? (
            <div role="list" style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
              {summary.features.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="listitem"
                  title={`${f.label}: ${f.uses} ${f.uses === 1 ? 'use' : 'uses'}, last ${formatDateTime(f.last_used_at)}. Click to filter the timeline.`}
                  onClick={() => {
                    setFeature(f.key === feature ? '' : f.key);
                    setPage(1);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 180px) 1fr 44px',
                    alignItems: 'center',
                    gap: 10,
                    padding: '4px 6px',
                    border: 0,
                    borderRadius: 8,
                    background: f.key === feature ? '#f0fdfa' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#0f172a' }}>{f.label}</span>
                  <span style={{ height: 10, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max(3, (f.uses / maxUses) * 100)}%`,
                        background: BAR_COLOR,
                        borderRadius: 4,
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{f.uses}</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', marginBottom: 18 }}>No feature use in this period.</p>
          )}
        </>
      ) : null}

      <div className="admin-toolbar">
        <select
          value={feature}
          onChange={(e) => {
            setFeature(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by feature"
        >
          <option value="">All features</option>
          {(summary?.feature_options || []).map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={includeTechnical}
            onChange={(e) => {
              setIncludeTechnical(e.target.checked);
              setPage(1);
            }}
          />
          Show technical events
        </label>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 190 }}>When</th>
              <th>What they did</th>
              <th style={{ width: 160 }}>Feature</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Loading…</td>
              </tr>
            ) : data.items.length ? (
              data.items.map((item) => (
                <Fragment key={item.id}>
                  <tr style={item.technical ? { color: '#64748b' } : undefined}>
                    <td>
                      <div>{formatDateTime(item.created_at)}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{timeAgo(item.created_at)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.label}</div>
                      <MetaSummary metadata={item.metadata} />
                    </td>
                    <td>
                      <span className="admin-badge secondary">{item.feature_label}</span>
                    </td>
                    <td>
                      <button type="button" className="admin-link" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
                        {openId === item.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {openId === item.id ? (
                    <tr>
                      <td colSpan={4} style={{ background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>
                          Event: <code>{item.event_type}</code> · Source: {item.source || '--'}
                        </div>
                        <pre style={{ margin: '6px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(item.metadata || {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No activity{feature ? ' for this feature' : ''} in the last 60 days.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || loading}>
          Prev
        </button>
        <span>
          Page {page} of {totalPages} ({data.total} {data.total === 1 ? 'action' : 'actions'})
        </span>
        <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading}>
          Next
        </button>
      </div>
    </div>
  );
}
